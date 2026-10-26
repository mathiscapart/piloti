"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { todayInput } from "@/lib/datetime";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { canWithdraw, insufficientBalanceMessage } from "./cashbox-balance";
import { parseAmountToCents } from "./format";

function parseDate(raw: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return new Date(todayInput());
  const [, y, mo, d] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

// #105 — le solde de la caisse source est relu DANS la transaction de
// l'écriture : un retrait ou un transfert qui le dépasse annule tout, AuditLog
// compris.
class InsufficientBalanceError extends Error {
  constructor(readonly balanceCents: number) {
    super("Solde insuffisant");
  }
}

async function assertCanWithdraw(
  tx: Prisma.TransactionClient,
  cashBoxId: string,
  amountCents: number,
): Promise<void> {
  const sum = await tx.cashTransaction.aggregate({
    where: { cashBoxId },
    _sum: { amountCents: true },
  });
  const balanceCents = sum._sum.amountCents ?? 0;
  if (!canWithdraw(balanceCents, amountCents)) {
    throw new InsufficientBalanceError(balanceCents);
  }
}

export async function createCashBox(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) return { error: "Réservé au trésorier." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { error: "Nom requis." };

  await withAudit(
    (tx) => tx.cashBox.create({ data: { name, createdById: user.id } }),
    (b) => ({
      action: "CASHBOX_CREATED",
      userId: user.id,
      metadata: { cashBoxId: b.id, name },
    }),
  );

  revalidatePath("/finances/caisses");
  return { error: null };
}

// Mouvement simple : dépôt (entrée) ou retrait (sortie).
export async function addMovement(
  cashBoxId: string,
  kind: "DEPOSIT" | "WITHDRAWAL",
  amountStr: string,
  label: string,
  dateStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) return { error: "Réservé au trésorier." };

  const cents = parseAmountToCents(amountStr);
  if (cents === null) return { error: "Montant invalide." };
  const lbl = label.trim() || (kind === "DEPOSIT" ? "Dépôt" : "Retrait");

  const box = await db.cashBox.findUnique({
    where: { id: cashBoxId },
    select: { id: true },
  });
  if (!box) return { error: "Caisse introuvable." };

  const signed = kind === "DEPOSIT" ? cents : -cents;
  try {
    await withAudit(
      async (tx) => {
        if (kind === "WITHDRAWAL") await assertCanWithdraw(tx, cashBoxId, cents);
        return tx.cashTransaction.create({
          data: {
            cashBoxId,
            amountCents: signed,
            label: lbl,
            kind,
            date: parseDate(dateStr),
            createdById: user.id,
          },
        });
      },
      {
        action: "CASH_MOVEMENT",
        userId: user.id,
        metadata: { cashBoxId, amountCents: signed, kind },
      },
    );
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return { error: insufficientBalanceMessage(err.balanceCents) };
    }
    throw err;
  }

  revalidatePath(`/finances/caisses/${cashBoxId}`);
  revalidatePath("/finances/caisses");
  return { error: null };
}

// Transfert entre deux caisses : deux mouvements liés (sortie / entrée).
export async function transferCash(
  fromId: string,
  toId: string,
  amountStr: string,
  label: string,
  dateStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) return { error: "Réservé au trésorier." };
  if (fromId === toId) return { error: "Choisis deux caisses différentes." };

  const cents = parseAmountToCents(amountStr);
  if (cents === null) return { error: "Montant invalide." };

  const boxes = await db.cashBox.findMany({
    where: { id: { in: [fromId, toId] } },
    select: { id: true, name: true },
  });
  if (boxes.length !== 2) return { error: "Caisse introuvable." };
  const fromName = boxes.find((b) => b.id === fromId)?.name ?? "";
  const toName = boxes.find((b) => b.id === toId)?.name ?? "";
  const date = parseDate(dateStr);
  const lbl = label.trim();
  const group = crypto.randomUUID();

  try {
    await withAudit(
      async (tx) => {
        await assertCanWithdraw(tx, fromId, cents);
        return tx.cashTransaction.createMany({
            data: [
              {
                cashBoxId: fromId,
                amountCents: -cents,
                label: lbl || `Transfert vers ${toName}`,
                kind: "TRANSFER",
                date,
                transferGroupId: group,
                createdById: user.id,
              },
              {
                cashBoxId: toId,
                amountCents: cents,
                label: lbl || `Transfert depuis ${fromName}`,
                kind: "TRANSFER",
                date,
                transferGroupId: group,
                createdById: user.id,
              },
            ],
        });
      },
      {
        action: "CASH_TRANSFER",
        userId: user.id,
        metadata: { fromId, toId, amountCents: cents },
      },
    );
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return { error: insufficientBalanceMessage(err.balanceCents) };
    }
    throw err;
  }

  revalidatePath("/finances/caisses");
  return { error: null };
}
