import "server-only";

import { db } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/enums";

// US-F04/F05 — budget d'événement (prévisionnel par catégorie vs réel dérivé des
// notes de frais remboursées liées) + encaissement des inscriptions payantes.
export async function getEventBudget(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      priceCents: true,
      socialPriceCents: true,
      requirePayment: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!event) return null;

  const [lines, expenses, registrations] = await Promise.all([
    db.budgetLine.findMany({
      where: { eventId },
      select: { category: true, plannedCents: true },
    }),
    // « Réel » = notes de frais remboursées rattachées à l'événement.
    db.expense.findMany({
      where: { eventId, status: "REIMBURSED" },
      select: { category: true, amountCents: true },
    }),
    db.eventRegistration.findMany({
      where: { eventId, response: "PRESENT" },
      orderBy: { createdAt: "asc" },
      select: {
        paidCents: true,
        social: true,
        user: { select: { id: true, firstName: true, lastName: true, image: true } },
      },
    }),
  ]);

  const plannedByCat = new Map(lines.map((l) => [l.category, l.plannedCents]));
  const actualByCat = new Map<string, number>();
  for (const e of expenses) {
    actualByCat.set(e.category, (actualByCat.get(e.category) ?? 0) + e.amountCents);
  }

  const budgetRows = EXPENSE_CATEGORIES.map((c) => ({
    category: c,
    plannedCents: plannedByCat.get(c) ?? 0,
    actualCents: actualByCat.get(c) ?? 0,
  }));
  const totalPlanned = budgetRows.reduce((a, r) => a + r.plannedCents, 0);
  const totalActual = budgetRows.reduce((a, r) => a + r.actualCents, 0);

  const attendeeCount = registrations.length;
  const price = event.priceCents ?? 0;
  const socialPrice = event.socialPriceCents ?? price; // tarif cas social
  const collected = registrations.reduce((a, r) => a + r.paidCents, 0);

  // Le revenu attendu tient compte du tarif effectif de chaque inscrit.
  const expectedRevenue = registrations.reduce(
    (a, r) => a + (r.social ? socialPrice : price),
    0,
  );

  return {
    event,
    budgetRows,
    totalPlanned,
    totalActual,
    attendeeCount,
    costPerYouthCents:
      attendeeCount > 0 ? Math.round(totalPlanned / attendeeCount) : 0,
    price,
    socialPrice,
    expectedRevenueCents: expectedRevenue,
    collectedCents: collected,
    // Marge : les tarifs demandés couvrent-ils le budget prévu ?
    marginCents: expectedRevenue - totalPlanned,
    registrations: registrations.map((r) => {
      const effective = r.social ? socialPrice : price;
      const dueCents = Math.max(0, effective - r.paidCents);
      return {
        user: r.user,
        paidCents: r.paidCents,
        priceCents: effective,
        social: r.social,
        dueCents,
        // Inscription provisoire : option activée + reste à payer.
        provisional: event.requirePayment && dueCents > 0,
      };
    }),
  };
}

export type EventBudget = NonNullable<
  Awaited<ReturnType<typeof getEventBudget>>
>;
