"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { parseAmountToCents } from "./format";

// US-F05 — définir le tarif (par défaut) et le tarif « cas social » d'un
// événement payant. Chaîne vide = tarif retiré (null).
export async function setEventPricing(
  eventId: string,
  priceStr: string,
  socialStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "budget.manage")) return { error: "Permission refusée." };

  const parseOptional = (s: string): { value: number | null } | { error: string } => {
    const t = s.trim();
    if (t.length === 0) return { value: null };
    const c = parseAmountToCents(t);
    return c === null ? { error: "Tarif invalide." } : { value: c };
  };
  const price = parseOptional(priceStr);
  if ("error" in price) return { error: price.error };
  const social = parseOptional(socialStr);
  if ("error" in social) return { error: social.error };

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return { error: "Événement introuvable." };

  await withAudit(
    (tx) =>
      tx.event.update({
        where: { id: eventId },
        data: { priceCents: price.value, socialPriceCents: social.value },
      }),
    {
      action: "EVENT_PRICE_SET",
      userId: user.id,
      metadata: { eventId, priceCents: price.value, socialPriceCents: social.value },
    },
  );

  revalidatePath(`/planning/${eventId}/budget`);
  return { error: null };
}

// US-F05 — (dé)marque une inscription au tarif « cas social ».
export async function toggleEventSocial(
  eventId: string,
  userId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "budget.manage")) return { error: "Permission refusée." };

  const reg = await db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true, social: true },
  });
  if (!reg) return { error: "Inscription introuvable." };

  await withAudit(
    (tx) =>
      tx.eventRegistration.update({
        where: { id: reg.id },
        data: { social: !reg.social },
      }),
    {
      action: "EVENT_PRICE_SET",
      userId: user.id,
      metadata: { eventId, userId, social: !reg.social },
    },
  );

  revalidatePath(`/planning/${eventId}/budget`);
  return { error: null };
}

// US-F05 — (dé)active l'inscription provisoire-tant-que-non-payée.
export async function setEventPaymentRequired(
  eventId: string,
  required: boolean,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "budget.manage")) return { error: "Permission refusée." };

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return { error: "Événement introuvable." };

  await withAudit(
    (tx) =>
      tx.event.update({ where: { id: eventId }, data: { requirePayment: required } }),
    {
      action: "EVENT_PRICE_SET",
      userId: user.id,
      metadata: { eventId, requirePayment: required },
    },
  );

  revalidatePath(`/planning/${eventId}/budget`);
  revalidatePath(`/planning/${eventId}`);
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
