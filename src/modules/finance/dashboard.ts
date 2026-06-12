import "server-only";

import { db } from "@/lib/db";

// US-F08 — tableau de bord financier (année civile).
// Entrées = cotisations encaissées (CampaignPayment) ; sorties = notes de frais
// remboursées (Expense REIMBURSED). « Net » = entrées − sorties (il ne s'agit
// PAS d'un solde bancaire réel — cf. US-F10 caisses).

export async function getFinancialDashboard(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const [payments, reimbursed] = await Promise.all([
    db.campaignPayment.findMany({
      where: { paidAt: { gte: start, lt: end } },
      select: { amountCents: true, paidAt: true },
    }),
    db.expense.findMany({
      where: { status: "REIMBURSED", reimbursedAt: { gte: start, lt: end } },
      select: { amountCents: true, reimbursedAt: true, category: true },
    }),
  ]);

  const encaissedCents = payments.reduce((a, p) => a + p.amountCents, 0);
  const disbursedCents = reimbursed.reduce((a, e) => a + e.amountCents, 0);

  // Répartition des sorties par catégorie.
  const catMap = new Map<string, number>();
  for (const e of reimbursed) {
    catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amountCents);
  }
  const byCategory = [...catMap.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);

  // Évolution mensuelle (12 mois).
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    inCents: 0,
    outCents: 0,
  }));
  for (const p of payments) byMonth[p.paidAt.getUTCMonth()].inCents += p.amountCents;
  for (const e of reimbursed) {
    if (e.reimbursedAt) byMonth[e.reimbursedAt.getUTCMonth()].outCents += e.amountCents;
  }

  return {
    year,
    encaissedCents,
    disbursedCents,
    netCents: encaissedCents - disbursedCents,
    byCategory,
    byMonth,
  };
}

export type FinancialDashboard = Awaited<
  ReturnType<typeof getFinancialDashboard>
>;

// Années disponibles (présence de données), pour le sélecteur.
export async function getFinancialYears(): Promise<number[]> {
  const [firstPayment, firstExpense] = await Promise.all([
    db.campaignPayment.findFirst({ orderBy: { paidAt: "asc" }, select: { paidAt: true } }),
    db.expense.findFirst({
      where: { reimbursedAt: { not: null } },
      orderBy: { reimbursedAt: "asc" },
      select: { reimbursedAt: true },
    }),
  ]);
  const now = new Date().getUTCFullYear();
  const candidates = [firstPayment?.paidAt, firstExpense?.reimbursedAt]
    .filter((d): d is Date => d != null)
    .map((d) => d.getUTCFullYear());
  const earliest = candidates.length > 0 ? Math.min(...candidates) : now;
  const years: number[] = [];
  for (let y = now; y >= earliest; y--) years.push(y);
  return years;
}
