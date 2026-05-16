"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
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

  const parsed = createLoanSchema.safeParse({
    equipmentIds: formData.getAll("equipmentId").map(String),
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

  // Multi-equipment : on bypass withAudit (qui gère 1 result/1 audit) et on
  // crée tout dans une transaction explicite — N Loan rows + N AuditLog.
  await db.$transaction(async (tx) => {
    const createdLoans = await Promise.all(
      parsed.data.equipmentIds.map((equipmentId) =>
        tx.loan.create({
          data: {
            equipmentId,
            borrowerId: parsed.data.borrowerId,
            quantity: 1,
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
    notes: formData.get("notes"),
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
          status: "RETOURNE",
          returnedAt: new Date(),
          returnedById: user.id,
          notes: parsed.data.notes ?? undefined,
        },
      }),
    {
      action: "LOAN_RETURNED",
      userId: user.id,
      loanId,
      equipmentId: loan.equipmentId,
      metadata: { condition: parsed.data.condition },
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
