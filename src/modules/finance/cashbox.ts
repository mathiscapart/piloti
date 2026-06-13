import "server-only";

import { db } from "@/lib/db";

// US-F10 — caisses : le solde est dérivé du grand livre (somme des montants
// signés des mouvements).

export async function listCashBoxes() {
  const boxes = await db.cashBox.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (boxes.length === 0) return { boxes: [], totalCents: 0 };

  const sums = await db.cashTransaction.groupBy({
    by: ["cashBoxId"],
    _sum: { amountCents: true },
  });
  const balance = new Map(
    sums.map((s) => [s.cashBoxId, s._sum.amountCents ?? 0]),
  );

  const withBalance = boxes.map((b) => ({
    ...b,
    balanceCents: balance.get(b.id) ?? 0,
  }));
  return {
    boxes: withBalance,
    totalCents: withBalance.reduce((a, b) => a + b.balanceCents, 0),
  };
}

export type CashBoxListItem = Awaited<
  ReturnType<typeof listCashBoxes>
>["boxes"][number];

export async function getCashBox(id: string) {
  const box = await db.cashBox.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!box) return null;

  const transactions = await db.cashTransaction.findMany({
    where: { cashBoxId: id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      amountCents: true,
      label: true,
      kind: true,
      date: true,
    },
  });
  const balanceCents = transactions.reduce((a, t) => a + t.amountCents, 0);
  // (Solde recalculé sur l'ensemble pour rester exact si > 100 mouvements.)
  const sum = await db.cashTransaction.aggregate({
    where: { cashBoxId: id },
    _sum: { amountCents: true },
  });

  return {
    box,
    transactions,
    balanceCents: sum._sum.amountCents ?? balanceCents,
  };
}

export type CashBoxDetail = NonNullable<Awaited<ReturnType<typeof getCashBox>>>;
