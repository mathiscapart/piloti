"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  RECEIPT_REQUIRED_ABOVE_CENTS,
  REIMBURSEMENT_METHODS,
  type ExpenseCategory,
  type ReimbursementMethod,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { saveUploadedPhoto, UploadError } from "@/lib/upload";
import { notify, notifyMany } from "@/modules/notifications/notify";

import { formatEuros, parseAmountToCents } from "./format";

function parseDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

// Notifie les trésoriers (+ admin) d'une nouvelle note de frais.
async function notifyTreasurers(
  expenseId: string,
  declarant: { id: string; firstName: string; lastName: string },
  amountCents: number,
  category: ExpenseCategory,
): Promise<void> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true, roles: true },
  });
  const recipients = users
    .filter((u) =>
      effectiveRoles(u).some((r) => r === "TRESORIER" || r === "ADMIN"),
    )
    .map((u) => u.id)
    .filter((id) => id !== declarant.id);
  if (recipients.length === 0) return;

  await notifyMany(recipients, (userId) => ({
    userId,
    type: "EXPENSE_SUBMITTED",
    title: `Note de frais : ${formatEuros(amountCents)}`,
    body: `${declarant.firstName} ${declarant.lastName} — ${EXPENSE_CATEGORY_LABEL[category]}`,
    link: "/finances/notes",
    messageId: expenseId,
  }));
}

async function notifyDeclarant(
  declarantId: string,
  expenseId: string,
  outcome: string,
  amountCents: number,
): Promise<void> {
  await notify({
    userId: declarantId,
    type: "EXPENSE_UPDATE",
    title: `Note de frais ${outcome}`,
    body: `Ta note de ${formatEuros(amountCents)} a été ${outcome}.`,
    link: "/finances/notes",
    messageId: expenseId,
  });
}

// US-F06 — déclarer une note de frais.
export async function createExpense(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "expense.create")) {
    return { error: "Tu n'as pas le droit de déclarer une note de frais." };
  }

  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null) return { error: "Montant invalide." };

  const date = parseDate(String(formData.get("date") ?? ""));
  if (!date) return { error: "Date invalide." };

  const category = String(formData.get("category") ?? "");
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Catégorie invalide." };
  }

  const note = String(formData.get("note") ?? "").trim() || null;

  let eventId: string | null = null;
  const eventIdRaw = String(formData.get("eventId") ?? "").trim();
  if (eventIdRaw) {
    const ev = await db.event.findUnique({
      where: { id: eventIdRaw },
      select: { id: true },
    });
    eventId = ev?.id ?? null;
  }

  // Reçu : traité comme une photo (resize/WebP). Obligatoire au-dessus du seuil.
  let receiptUrl: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    try {
      receiptUrl = await saveUploadedPhoto(file);
    } catch (err) {
      return {
        error: err instanceof UploadError ? err.message : "Échec de l'envoi du reçu.",
      };
    }
  }
  if (amountCents > RECEIPT_REQUIRED_ABOVE_CENTS && !receiptUrl) {
    return {
      error: `Le reçu est obligatoire au-dessus de ${RECEIPT_REQUIRED_ABOVE_CENTS / 100} €.`,
    };
  }

  const created = await withAudit(
    (tx) =>
      tx.expense.create({
        data: {
          declarantId: user.id,
          amountCents,
          date,
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
      metadata: { expenseId: e.id, amountCents, category },
    }),
  );

  after(() =>
    notifyTreasurers(created.id, user, amountCents, category as ExpenseCategory),
  );

  redirect("/finances/notes?notice=expense-created");
}

// US-F07 — approuver une note de frais (trésorier).
export async function approveExpense(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "expense.manage")) return { error: "Réservé au trésorier." };

  const e = await db.expense.findUnique({
    where: { id },
    select: { status: true, declarantId: true, amountCents: true },
  });
  if (!e) return { error: "Note introuvable." };
  if (e.status !== "PENDING") return { error: "Cette note n'est pas en attente." };

  await withAudit(
    (tx) =>
      tx.expense.update({
        where: { id },
        data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
      }),
    { action: "EXPENSE_APPROVED", userId: user.id, metadata: { expenseId: id } },
  );

  after(() => notifyDeclarant(e.declarantId, id, "approuvée", e.amountCents));
  revalidatePath("/finances/notes");
  return { error: null };
}

// US-F07 — refuser une note de frais avec motif (trésorier).
export async function rejectExpense(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "expense.manage")) return { error: "Réservé au trésorier." };

  const e = await db.expense.findUnique({
    where: { id },
    select: { status: true, declarantId: true, amountCents: true },
  });
  if (!e) return { error: "Note introuvable." };
  if (e.status !== "PENDING") return { error: "Cette note n'est pas en attente." };

  const motif = reason.trim() || "Sans motif précisé.";
  await withAudit(
    (tx) =>
      tx.expense.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectionReason: motif,
        },
      }),
    { action: "EXPENSE_REJECTED", userId: user.id, metadata: { expenseId: id } },
  );

  after(() => notifyDeclarant(e.declarantId, id, "refusée", e.amountCents));
  revalidatePath("/finances/notes");
  return { error: null };
}

// US-F07 — marquer une note comme remboursée (trésorier).
export async function reimburseExpense(
  id: string,
  method: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "expense.manage")) return { error: "Réservé au trésorier." };
  if (!(REIMBURSEMENT_METHODS as readonly string[]).includes(method)) {
    return { error: "Mode de remboursement invalide." };
  }

  const e = await db.expense.findUnique({
    where: { id },
    select: { status: true, declarantId: true, amountCents: true },
  });
  if (!e) return { error: "Note introuvable." };
  if (e.status !== "APPROVED") {
    return { error: "Seule une note approuvée peut être remboursée." };
  }

  await withAudit(
    (tx) =>
      tx.expense.update({
        where: { id },
        data: {
          status: "REIMBURSED",
          reimbursedAt: new Date(),
          reimbursementMethod: method as ReimbursementMethod,
        },
      }),
    { action: "EXPENSE_REIMBURSED", userId: user.id, metadata: { expenseId: id } },
  );

  after(() => notifyDeclarant(e.declarantId, id, "remboursée", e.amountCents));
  revalidatePath("/finances/notes");
  return { error: null };
}
