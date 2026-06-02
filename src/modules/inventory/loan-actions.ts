"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { ACTIVE_LOAN_STATUSES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { withAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";

import type { ActionResult } from "@/lib/types";
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

  // US-30 — chaque article sélectionné porte une quantité (champ `qty__<id>`).
  const equipmentIds = formData.getAll("equipmentId").map(String);
  const items = equipmentIds.map((equipmentId) => ({
    equipmentId,
    quantity: formData.get(`qty__${equipmentId}`) ?? "1",
  }));

  const parsed = createLoanSchema.safeParse({
    items,
    borrowerId: formData.get("borrowerId"),
    startDate: formData.get("startDate"),
    expectedReturn: formData.get("expectedReturn"),
    eventName: formData.get("eventName"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  if (parsed.data.expectedReturn < parsed.data.startDate) {
    return { error: "La date de retour doit être postérieure au départ." };
  }

  // US-30 — contrôle de disponibilité : la quantité empruntée ne peut dépasser
  // la quantité réellement disponible (total − quantités déjà prêtées actives).
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
        select: { quantity: true },
      },
    },
  });
  const byId = new Map(equipments.map((eq) => [eq.id, eq]));

  for (const item of parsed.data.items) {
    const eq = byId.get(item.equipmentId);
    if (!eq || eq.archived) {
      return { error: "Un des articles sélectionnés est introuvable." };
    }
    if (eq.condition === "A_REPARER" || eq.condition === "HORS_SERVICE") {
      return { error: `« ${eq.name} » n'est pas empruntable (en réparation / hors service).` };
    }
    const loaned = eq.loans.reduce((sum, l) => sum + l.quantity, 0);
    const available = Math.max(0, eq.totalQty - loaned);
    if (item.quantity > available) {
      return {
        error: `« ${eq.name} » : ${available} disponible(s), ${item.quantity} demandé(s).`,
      };
    }
  }

  // Multi-equipment : on bypass withAudit (qui gère 1 result/1 audit) et on
  // crée tout dans une transaction explicite — N Loan rows + N AuditLog.
  await db.$transaction(async (tx) => {
    const createdLoans = await Promise.all(
      parsed.data.items.map((item) =>
        tx.loan.create({
          data: {
            equipmentId: item.equipmentId,
            borrowerId: parsed.data.borrowerId,
            quantity: item.quantity,
            startDate: parsed.data.startDate,
            expectedReturn: parsed.data.expectedReturn,
            status: "ACTIF",
            eventName: parsed.data.eventName,
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

  revalidatePath("/prets");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  redirect("/prets?notice=loan-created");
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
    dryingPersonName: formData.get("dryingPersonName"),
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

  await withAudit(
    (tx) =>
      tx.loan.update({
        where: { id: loanId },
        data: {
          status: "SECHAGE",
          dryingLocation: parsed.data.dryingLocation,
          dryingPersonName: parsed.data.dryingPersonName ?? null,
        },
      }),
    {
      action: "LOAN_DRYING_STARTED",
      userId: user.id,
      loanId,
      equipmentId: loan.equipmentId,
      metadata: {
        dryingLocation: parsed.data.dryingLocation,
        dryingPersonName: parsed.data.dryingPersonName,
      },
    },
  );

  revalidatePath("/prets");
  revalidatePath("/dashboard");
  redirect("/prets?notice=loan-drying");
}
