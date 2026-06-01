"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { createDonationSchema, rejectDonationSchema } from "./types";

// US-25 — un donateur propose un don. La demande entre en file d'attente
// (PENDING) ; rien n'entre dans le stock tant qu'un admin ne valide pas.
export async function createDonation(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "donation.create")) {
    return { error: "Vous devez être connecté pour proposer un don." };
  }

  const parsed = createDonationSchema.safeParse({
    category: formData.get("category"),
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    condition: formData.get("condition"),
    dropoffDate: formData.get("dropoffDate"),
    donorName: formData.get("donorName"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  // La catégorie doit exister et être active (non archivée).
  const category = await db.category.findUnique({
    where: { slug: parsed.data.category },
    select: { archived: true },
  });
  if (!category || category.archived) {
    return { error: "Choisis une catégorie valide dans la liste." };
  }

  await withAudit(
    (tx) =>
      tx.donation.create({
        data: {
          category: parsed.data.category,
          name: parsed.data.name,
          quantity: parsed.data.quantity,
          condition: parsed.data.condition,
          dropoffDate: parsed.data.dropoffDate ?? null,
          donorName:
            parsed.data.donorName ?? `${user.firstName} ${user.lastName}`,
          donorId: user.id,
          note: parsed.data.note ?? null,
          status: "PENDING",
        },
      }),
    (created) => ({
      action: "DONATION_SUBMITTED",
      userId: user.id,
      metadata: { donationId: created.id, name: created.name },
    }),
  );

  revalidatePath("/admin/dons");
  redirect("/dons/nouveau?notice=donation-submitted");
}

// US-25 — validation admin : crée l'article dans le stock et marque le don validé,
// dans la même transaction (+ double trace audit).
export async function approveDonation(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "donation.review")) {
    return { error: "Seul un administrateur peut valider un don." };
  }

  const donation = await db.donation.findUnique({ where: { id } });
  if (!donation) return { error: "Don introuvable." };
  if (donation.status !== "PENDING") {
    return { error: "Ce don a déjà été traité." };
  }

  await db.$transaction(async (tx) => {
    const equipment = await tx.equipment.create({
      data: {
        name: donation.name,
        category: donation.category,
        totalQty: donation.quantity,
        condition: donation.condition,
        notes: donation.donorName
          ? `Don de ${donation.donorName}${donation.note ? ` — ${donation.note}` : ""}`
          : (donation.note ?? null),
      },
    });

    await tx.donation.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        createdEquipmentId: equipment.id,
      },
    });

    await tx.auditLog.createMany({
      data: [
        {
          action: "EQUIPMENT_CREATED",
          userId: user.id,
          equipmentId: equipment.id,
          metadata: JSON.stringify({ fromDonation: id, name: equipment.name }),
        },
        {
          action: "DONATION_APPROVED",
          userId: user.id,
          equipmentId: equipment.id,
          metadata: JSON.stringify({ donationId: id }),
        },
      ],
    });
  });

  revalidatePath("/admin/dons");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  return { error: null };
}

// US-25 — refus : aucune insertion dans le stock.
export async function rejectDonation(
  id: string,
  reason: string | undefined,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "donation.review")) {
    return { error: "Seul un administrateur peut refuser un don." };
  }

  const parsed = rejectDonationSchema.safeParse({ rejectedReason: reason });
  if (!parsed.success) {
    return { error: "Données invalides." };
  }

  const donation = await db.donation.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!donation) return { error: "Don introuvable." };
  if (donation.status !== "PENDING") {
    return { error: "Ce don a déjà été traité." };
  }

  await withAudit(
    (tx) =>
      tx.donation.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectedReason: parsed.data.rejectedReason ?? null,
        },
      }),
    {
      action: "DONATION_REJECTED",
      userId: user.id,
      metadata: { donationId: id, reason: parsed.data.rejectedReason },
    },
  );

  revalidatePath("/admin/dons");
  return { error: null };
}
