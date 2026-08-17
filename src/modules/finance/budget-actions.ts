"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  EXPENSE_CATEGORIES,
  RECEIPT_REQUIRED_ABOVE_CENTS,
  type ExpenseCategory,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { saveUploadedPhoto, UploadError } from "@/lib/upload";

import { refuseIfEventOutOfScope } from "@/modules/planning/event-scope";

import { notifyTreasurers } from "./expense-notify";
import { parseAmountToCents } from "./format";

// US-F05 — définir le tarif (par défaut) d'un événement payant. Le tarif
// effectif de chaque jeune est ensuite pondéré par sa tranche de quotient
// familial (cf. modules/finance/brackets). Chaîne vide = gratuit (null).
export async function setEventPricing(
  eventId: string,
  priceStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "budget.manage")) return { error: "Permission refusée." };

  const t = priceStr.trim();
  let priceCents: number | null = null;
  if (t.length > 0) {
    priceCents = parseAmountToCents(t);
    if (priceCents === null) return { error: "Tarif invalide." };
  }

  // Périmètre d'unité (D-024) : le budget suit l'événement. Un CHEF est borné à
  // sa branche ; le TRÉSORIER, rôle transverse, ne l'est pas — c'est
  // `canActOnUnit` qui fait cette distinction, pas un test de rôle ici.
  const outOfScope = await refuseIfEventOutOfScope(user, "budget.manage", eventId);
  if (outOfScope) return outOfScope;

  await withAudit(
    (tx) =>
      tx.event.update({
        where: { id: eventId },
        data: { priceCents },
      }),
    {
      action: "EVENT_PRICE_SET",
      userId: user.id,
      metadata: { eventId, priceCents },
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

  const outOfScope = await refuseIfEventOutOfScope(user, "budget.manage", eventId);
  if (outOfScope) return outOfScope;

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

  const outOfScope = await refuseIfEventOutOfScope(user, "budget.manage", eventId);
  if (outOfScope) return outOfScope;

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

  const outOfScope = await refuseIfEventOutOfScope(actor, "budget.manage", eventId);
  if (outOfScope) return outOfScope;

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

// US-F14 — enregistrer un « ticket de caisse » sur un événement (photo +
// montant + catégorie), au fil de l'eau. Crée une dépense (Expense) rattachée
// à l'événement, en attente, qui remonte automatiquement à la trésorerie et
// alimente le réel du budget.
export async function addEventTicket(
  eventId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "expense.create")) return { error: "Permission refusée." };

  // Une note de frais rattachée à un événement alimente le budget de CET
  // événement : même périmètre. Les rôles transverses (matériel, secrétaire,
  // trésorier) restent libres, seul un CHEF est borné à sa branche.
  const outOfScope = await refuseIfEventOutOfScope(user, "expense.create", eventId);
  if (outOfScope) return outOfScope;

  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null || amountCents <= 0) return { error: "Montant invalide." };

  const category = String(formData.get("category") ?? "");
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Catégorie invalide." };
  }

  const note = String(formData.get("note") ?? "").trim() || null;

  // Photo du ticket (resize/WebP). Obligatoire au-dessus du seuil.
  let receiptUrl: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    try {
      receiptUrl = await saveUploadedPhoto(file);
    } catch (err) {
      return {
        error: err instanceof UploadError ? err.message : "Échec de l'envoi du ticket.",
      };
    }
  }
  if (amountCents > RECEIPT_REQUIRED_ABOVE_CENTS && !receiptUrl) {
    return {
      error: `La photo du ticket est obligatoire au-dessus de ${RECEIPT_REQUIRED_ABOVE_CENTS / 100} €.`,
    };
  }

  const created = await withAudit(
    (tx) =>
      tx.expense.create({
        data: {
          declarantId: user.id,
          amountCents,
          date: new Date(), // ticket saisi en direct
          category,
          eventId,
          note,
          receiptUrl,
          status: "PENDING",
        },
      }),
    (e) => ({
      action: "EXPENSE_CREATED",
      userId: user.id,
      metadata: { expenseId: e.id, eventId, amountCents, category, ticket: true },
    }),
  );

  // Remontée automatique à la trésorerie.
  after(() =>
    notifyTreasurers(created.id, user, amountCents, category as ExpenseCategory),
  );

  revalidatePath(`/planning/${eventId}/budget`);
  return { error: null };
}
