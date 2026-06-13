"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { parseAmountToCents } from "./format";

// US-F05 — définir (ou retirer) le tarif d'un événement payant.
export async function setEventPrice(
  eventId: string,
  amountStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "budget.manage")) return { error: "Permission refusée." };

  const trimmed = amountStr.trim();
  let priceCents: number | null = null;
  if (trimmed.length > 0) {
    priceCents = parseAmountToCents(trimmed);
    if (priceCents === null) return { error: "Tarif invalide." };
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return { error: "Événement introuvable." };

  await withAudit(
    (tx) => tx.event.update({ where: { id: eventId }, data: { priceCents } }),
    { action: "EVENT_PRICE_SET", userId: user.id, metadata: { eventId, priceCents } },
  );

  revalidatePath(`/planning/${eventId}/budget`);
  return { error: null };
}

// US-F04 — définir le montant prévu d'une catégorie de budget (0 = retire).
export async function setBudgetLine(
  eventId: string,
  category: string,
  plannedStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "budget.manage")) return { error: "Permission refusée." };
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Catégorie invalide." };
  }

  const trimmed = plannedStr.trim();
  const plannedCents = trimmed.length === 0 ? 0 : parseAmountToCents(trimmed);
  if (plannedCents === null) return { error: "Montant invalide." };

  await withAudit(
    async (tx) => {
      if (plannedCents === 0) {
        await tx.budgetLine.deleteMany({ where: { eventId, category } });
        return null;
      }
      return tx.budgetLine.upsert({
        where: { eventId_category: { eventId, category } },
        create: { eventId, category, plannedCents },
        update: { plannedCents },
      });
    },
    {
      action: "BUDGET_LINE_SET",
      userId: user.id,
      metadata: { eventId, category, plannedCents },
    },
  );

  revalidatePath(`/planning/${eventId}/budget`);
  return { error: null };
}

// US-F05 — enregistrer un encaissement pour l'inscription d'un jeune.
export async function recordEventPayment(
  eventId: string,
  userId: string,
  amountStr: string,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "budget.manage")) return { error: "Permission refusée." };

  const amountCents = parseAmountToCents(amountStr);
  if (amountCents === null) return { error: "Montant invalide." };

  const reg = await db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true, paidCents: true },
  });
  if (!reg) return { error: "Inscription introuvable." };

  await withAudit(
    (tx) =>
      tx.eventRegistration.update({
        where: { id: reg.id },
        data: { paidCents: reg.paidCents + amountCents },
      }),
    {
      action: "EVENT_PAYMENT_RECORDED",
      userId: actor.id,
      metadata: { eventId, userId, amountCents },
    },
  );

  revalidatePath(`/planning/${eventId}/budget`);
  return { error: null };
}
