"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { ACTIVE_LOAN_STATUSES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { withAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { publishChannelEvent } from "@/lib/realtime";

import type { ActionResult } from "@/lib/types";
import { resolveOverdueNotifications } from "./overdue";
import {
  createLoanSchema,
  dryingSchema,
  returnLoanSchema,
} from "./types";

// ----------------------------------------------------------------------------
// Wizard step 2 → création d'un prêt par equipmentId, dans la même transaction.
// ----------------------------------------------------------------------------

export async function createLoan(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "loan.create")) {
    return { error: "Vous n'avez pas la permission de créer un prêt." };
  }

  // US-30 — chaque article porte une quantité (`qty__<id>`).
  // US-32 — et sa propre date de retour (`return__<id>`, défaut = date commune).
  const equipmentIds = formData.getAll("equipmentId").map(String);
  const items = equipmentIds.map((equipmentId) => ({
    equipmentId,
    quantity: formData.get(`qty__${equipmentId}`) ?? "1",
    expectedReturn: formData.get(`return__${equipmentId}`) ?? undefined,
  }));

  const parsed = createLoanSchema.safeParse({
    items,
    borrowerId: formData.get("borrowerId"),
    startDate: formData.get("startDate"),
    expectedReturn: formData.get("expectedReturn"),
    eventName: formData.get("eventName"),
    eventId: formData.get("eventId"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  if (parsed.data.expectedReturn < parsed.data.startDate) {
    return { error: "La date de retour doit être postérieure au départ." };
  }

  // US-32 — un jeune (loan.create accordé par la branche Pios/Compas, mais sans
  // loan.view) ne peut créer un prêt QUE pour lui-même. Les gestionnaires
  // (chef / responsable matériel / admin) empruntent pour n'importe qui.
  const isLoanManager = can(user, "loan.view");
  if (!isLoanManager && parsed.data.borrowerId !== user.id) {
    return { error: "Tu ne peux créer un prêt que pour toi-même." };
  }

  // US-12/US-30 — contrôle de disponibilité SELON LES DATES : la quantité
  // empruntée ne peut dépasser la quantité disponible sur la période de CHAQUE
  // article (total − quantités des prêts actifs qui chevauchent cette période).
  const equipments = await db.equipment.findMany({
    where: { id: { in: parsed.data.items.map((i) => i.equipmentId) } },
    select: {
      id: true,
      name: true,
      totalQty: true,
      condition: true,
      archived: true,
      loans: {
        where: { status: { in: [...ACTIVE_LOAN_STATUSES] } },
        select: { quantity: true, startDate: true, expectedReturn: true },
      },
    },
  });
  const byId = new Map(equipments.map((eq) => [eq.id, eq]));
  const start = parsed.data.startDate;

  for (const item of parsed.data.items) {
    const eq = byId.get(item.equipmentId);
    if (!eq || eq.archived) {
      return { error: "Un des articles sélectionnés est introuvable." };
    }
    if (eq.condition === "A_REPARER" || eq.condition === "HORS_SERVICE") {
      return { error: `« ${eq.name} » n'est pas empruntable (en réparation / hors service).` };
    }
    const itemEnd = item.expectedReturn ?? parsed.data.expectedReturn;
    if (itemEnd < start) {
      return {
        error: `« ${eq.name} » : la date de retour doit être postérieure au départ.`,
      };
    }
    // Deux périodes se chevauchent ssi start1 <= end2 && start2 <= end1.
    const loaned = eq.loans
      .filter((l) => l.startDate <= itemEnd && l.expectedReturn >= start)
      .reduce((sum, l) => sum + l.quantity, 0);
    const available = Math.max(0, eq.totalQty - loaned);
    if (item.quantity > available) {
      return {
        error: `« ${eq.name} » : ${available} disponible(s) sur cette période, ${item.quantity} demandé(s).`,
      };
    }
  }

  // US-P12 — lien optionnel à un événement du planning. Si lié et qu'aucun
  // libellé libre n'est saisi, on prend le nom de l'événement comme snapshot.
  let eventId: string | null = null;
  let eventName = parsed.data.eventName ?? null;
  if (parsed.data.eventId) {
    const event = await db.event.findUnique({
      where: { id: parsed.data.eventId },
      select: { id: true, name: true },
    });
    if (!event) return { error: "Événement lié introuvable." };
    eventId = event.id;
    if (!eventName) eventName = event.name;
  }

  // US-32 — un seul prêt groupé : N lignes (une par article) partageant un
  // `groupId`, chacune avec sa propre date de retour. Transaction explicite
  // (withAudit gère 1 result/1 audit) → N Loan rows + N AuditLog.
  const groupId = crypto.randomUUID();
  await db.$transaction(async (tx) => {
    const createdLoans = await Promise.all(
      parsed.data.items.map((item) =>
        tx.loan.create({
          data: {
            groupId,
            equipmentId: item.equipmentId,
            borrowerId: parsed.data.borrowerId,
            quantity: item.quantity,
            startDate: parsed.data.startDate,
            expectedReturn: item.expectedReturn ?? parsed.data.expectedReturn,
            status: "ACTIF",
            eventName,
            eventId,
            notes: parsed.data.notes,
          },
        }),
      ),
    );

    await tx.auditLog.createMany({
      data: createdLoans.map((loan) => ({
        action: "LOAN_CREATED",
        userId: user.id,
        equipmentId: loan.equipmentId,
        loanId: loan.id,
        metadata: JSON.stringify({
          borrowerId: loan.borrowerId,
          quantity: loan.quantity,
          eventName: loan.eventName,
        }),
      })),
    });
  });

  // US-16 — demande d'aide week-end : publie un sondage dans le canal général,
  // lié au prêt (groupId). Best-effort : si le salon n'existe pas, on ignore.
  if (formData.get("requestHelp") === "on") {
    const general = await db.channel.findUnique({
      where: { slug: "general" },
      select: { id: true },
    });
    if (general) {
      const names = parsed.data.items
        .map((i) => byId.get(i.equipmentId)?.name)
        .filter(Boolean)
        .join(", ");
      const fmt = (d: Date) =>
        d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      const context = `${names} · du ${fmt(parsed.data.startDate)} au ${fmt(parsed.data.expectedReturn)}`;
      const options = [
        "Amener le matériel",
        "Ramener le matériel",
        "Renfort humain (manque de monde)",
      ].map((label) => ({ id: crypto.randomUUID().slice(0, 8), label }));

      const poll = await db.poll.create({
        data: {
          channelId: general.id,
          authorId: user.id,
          question: `Qui peut aider ${parsed.data.eventName ? `pour « ${parsed.data.eventName} »` : "ce week-end"} ? (${context})`,
          options: JSON.stringify(options),
          allowMultiple: true,
          loanGroupId: groupId,
        },
      });
      publishChannelEvent({
        type: "poll",
        channelId: general.id,
        payload: { id: poll.id },
      });
      revalidatePath("/communication/general");
    }
  }

  revalidatePath("/prets");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  // #4 — pas de cul-de-sac : un jeune n'a pas accès à /prets, on le ramène au
  // dashboard ; les gestionnaires vont sur la liste des prêts.
  redirect(
    isLoanManager
      ? "/prets?notice=loan-created"
      : "/dashboard?notice=loan-created",
  );
}

// ----------------------------------------------------------------------------
// Retour d'un prêt. Si l'état n'est pas BON, on redirige vers le form incident
// préfilled (Phase 7 fournit la page).
// ----------------------------------------------------------------------------

export async function returnLoan(
  loanId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "loan.return.validate")) {
    return {
      error: "Seul un administrateur ou un chef peut valider un retour.",
    };
  }

  const parsed = returnLoanSchema.safeParse({
    condition: formData.get("condition"),
    returnedQuantity: formData.get("returnedQuantity") ?? undefined,
    returnWeightKg: formData.get("returnWeightKg") ?? undefined,
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const loan = await db.loan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      equipmentId: true,
      status: true,
      quantity: true,
      equipment: { select: { category: true } },
    },
  });
  if (!loan) return { error: "Prêt introuvable." };
  if (loan.status === "RETOURNE") {
    return { error: "Ce prêt est déjà clôturé." };
  }

  // US-17 — si la catégorie de l'article exige une pesée au retour, le poids
  // est obligatoire.
  const category = await db.category.findUnique({
    where: { slug: loan.equipment.category },
    select: { requireWeighing: true },
  });
  if (category?.requireWeighing) {
    if (parsed.data.returnWeightKg === undefined) {
      return { error: "Cette catégorie exige de peser le matériel au retour." };
    }
    // US-18 — le poids au retour doit être inférieur au poids de référence
    // (dernière pesée connue, sinon poids de base). Sinon → anomalie bloquante.
    const eq = await db.equipment.findUnique({
      where: { id: loan.equipmentId },
      select: {
        baseWeightKg: true,
        loans: {
          where: { returnWeightKg: { not: null }, NOT: { id: loanId } },
          orderBy: { returnedAt: "desc" },
          take: 1,
          select: { returnWeightKg: true },
        },
      },
    });
    const reference = eq?.loans[0]?.returnWeightKg ?? eq?.baseWeightKg ?? null;
    if (reference != null && parsed.data.returnWeightKg >= reference) {
      return {
        error: `Poids au retour (${parsed.data.returnWeightKg} kg) ≥ poids de référence (${reference} kg). Une bouteille utilisée doit peser moins — vérifie la pesée.`,
      };
    }
  }

  // US-30 — retour total ou partiel. Sans quantité saisie : on rend tout.
  const returnedQty = parsed.data.returnedQuantity ?? loan.quantity;
  if (returnedQty > loan.quantity) {
    return { error: `Quantité rendue invalide (max ${loan.quantity}).` };
  }
  const isPartial = returnedQty < loan.quantity;

  await withAudit(
    (tx) =>
      tx.loan.update({
        where: { id: loanId },
        data: isPartial
          ? {
              // Retour partiel : on décrémente la quantité en cours, le prêt
              // reste ouvert pour le reste. Le stock se réincrémente d'autant.
              quantity: loan.quantity - returnedQty,
              returnWeightKg: parsed.data.returnWeightKg ?? undefined,
              notes: parsed.data.notes ?? undefined,
            }
          : {
              status: "RETOURNE",
              returnedAt: new Date(),
              returnedById: user.id,
              returnWeightKg: parsed.data.returnWeightKg ?? undefined,
              notes: parsed.data.notes ?? undefined,
            },
      }),
    {
      action: "LOAN_RETURNED",
      userId: user.id,
      loanId,
      equipmentId: loan.equipmentId,
      metadata: {
        condition: parsed.data.condition,
        returnedQuantity: returnedQty,
        partial: isPartial,
        returnWeightKg: parsed.data.returnWeightKg,
      },
    },
  );

  // US-07 — l'alerte de retard se résout au retour complet du prêt.
  if (!isPartial) {
    await resolveOverdueNotifications(loanId);
  }

  revalidatePath("/prets");
  revalidatePath("/stock");
  revalidatePath(`/stock/${loan.equipmentId}`);
  revalidatePath("/dashboard");

  // Si abîmé / à réparer → on bascule vers le form incident préfilled.
  if (parsed.data.condition !== "BON") {
    redirect(
      `/incidents/nouveau?equipmentId=${loan.equipmentId}&loanId=${loan.id}`,
    );
  }

  redirect("/prets?notice=loan-returned");
}

// ----------------------------------------------------------------------------
// Mettre un prêt en séchage (transition ACTIF/RETARD → SECHAGE).
// ----------------------------------------------------------------------------

export async function markAsDrying(
  loanId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "equipment.status.change")) {
    return { error: "Permission refusée." };
  }

  const parsed = dryingSchema.safeParse({
    dryingLocation: formData.get("dryingLocation"),
    dryingContactId: formData.get("dryingContactId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const loan = await db.loan.findUnique({
    where: { id: loanId },
    select: { id: true, equipmentId: true, status: true },
  });
  if (!loan) return { error: "Prêt introuvable." };
  if (loan.status === "RETOURNE") {
    return { error: "Ce prêt est déjà clôturé." };
  }

  // US-23 — le contact est un compte : on vérifie qu'il existe et on garde un
  // snapshot du nom (dryingPersonName) pour l'affichage + le legacy.
  let dryingContactId: string | null = null;
  let dryingPersonName: string | null = null;
  if (parsed.data.dryingContactId) {
    const contact = await db.user.findUnique({
      where: { id: parsed.data.dryingContactId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!contact) return { error: "Contact de séchage introuvable." };
    dryingContactId = contact.id;
    dryingPersonName = `${contact.firstName} ${contact.lastName}`;
  }

  await withAudit(
    (tx) =>
      tx.loan.update({
        where: { id: loanId },
        data: {
          status: "SECHAGE",
          dryingLocation: parsed.data.dryingLocation,
          dryingContactId,
          dryingPersonName,
        },
      }),
    {
      action: "LOAN_DRYING_STARTED",
      userId: user.id,
      loanId,
      equipmentId: loan.equipmentId,
      metadata: {
        dryingLocation: parsed.data.dryingLocation,
        dryingContactId,
        dryingPersonName,
      },
    },
  );

  revalidatePath("/prets");
  revalidatePath("/dashboard");
  redirect("/prets?notice=loan-drying");
}
