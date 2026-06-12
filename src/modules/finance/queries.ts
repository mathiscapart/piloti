import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

// US-F06/F07 — notes de frais.

const EXPENSE_SELECT = {
  id: true,
  amountCents: true,
  date: true,
  category: true,
  note: true,
  receiptUrl: true,
  status: true,
  rejectionReason: true,
  reimbursedAt: true,
  reimbursementMethod: true,
  createdAt: true,
  declarant: { select: { id: true, firstName: true, lastName: true, image: true } },
  reviewer: { select: { firstName: true, lastName: true } },
  event: { select: { id: true, name: true } },
} as const;

export type ExpenseStatusFilter = "pending" | "processed" | "all";

// `scope: "mine"` = uniquement les notes du déclarant ; "all" = toutes (trésorier).
export async function listExpenses(opts: {
  scope: "all" | "mine";
  viewerId: string;
  status?: ExpenseStatusFilter;
}) {
  const where: Prisma.ExpenseWhereInput = {};
  if (opts.scope === "mine") where.declarantId = opts.viewerId;
  if (opts.status === "pending") where.status = "PENDING";
  if (opts.status === "processed") {
    where.status = { in: ["APPROVED", "REIMBURSED", "REJECTED"] };
  }

  return db.expense.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: EXPENSE_SELECT,
  });
}

export type ExpenseListItem = Awaited<ReturnType<typeof listExpenses>>[number];

export async function getExpense(id: string) {
  return db.expense.findUnique({ where: { id }, select: EXPENSE_SELECT });
}

// Totaux pour l'en-tête (trésorier) : à traiter + montant en attente + à payer.
export async function getExpenseSummary() {
  const [pending, approved] = await Promise.all([
    db.expense.aggregate({
      where: { status: "PENDING" },
      _count: true,
      _sum: { amountCents: true },
    }),
    db.expense.aggregate({
      where: { status: "APPROVED" },
      _count: true,
      _sum: { amountCents: true },
    }),
  ]);
  return {
    pendingCount: pending._count,
    pendingCents: pending._sum.amountCents ?? 0,
    toReimburseCount: approved._count,
    toReimburseCents: approved._sum.amountCents ?? 0,
  };
}

// Compteur de notes en attente (badge nav éventuel).
export async function countPendingExpenses() {
  return db.expense.count({ where: { status: "PENDING" } });
}
