import "server-only";

import { db } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/enums";

import { bracketedPriceCents } from "./brackets";

// US-F04/F05 — budget d'événement (prévisionnel par catégorie vs réel dérivé des
// notes de frais remboursées liées) + encaissement des inscriptions payantes.
// Le tarif de chaque jeune dépend de sa tranche de quotient familial (globale).
export async function getEventBudget(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      priceCents: true,
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
    // US-F14 — « réel » = dépenses/tickets de caisse rattachés à l'événement,
    // non refusés (en attente comprise → mise à jour en direct au fil des
    // tickets, avant même le remboursement).
    db.expense.findMany({
      where: { eventId, status: { not: "REJECTED" } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        category: true,
        amountCents: true,
        date: true,
        receiptUrl: true,
        status: true,
        note: true,
        declarant: { select: { firstName: true, lastName: true } },
      },
    }),
    db.eventRegistration.findMany({
      where: { eventId, response: "PRESENT" },
      orderBy: { createdAt: "asc" },
      select: {
        paidCents: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            image: true,
            socialBracket: {
              select: { name: true, coefficientPermille: true },
            },
          },
        },
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
  const collected = registrations.reduce((a, r) => a + r.paidCents, 0);

  // Tarif effectif par inscrit = tarif de base × coefficient de sa tranche.
  const detailed = registrations.map((r) => {
    const permille = r.user.socialBracket?.coefficientPermille ?? 1000;
    const effective = bracketedPriceCents(price, permille);
    const dueCents = Math.max(0, effective - r.paidCents);
    return {
      user: {
        id: r.user.id,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
        image: r.user.image,
      },
      paidCents: r.paidCents,
      priceCents: effective,
      bracketName: r.user.socialBracket?.name ?? null,
      coefficientPermille: permille,
      dueCents,
      // Inscription provisoire : option activée + reste à payer.
      provisional: event.requirePayment && dueCents > 0,
    };
  });

  const expectedRevenue = detailed.reduce((a, r) => a + r.priceCents, 0);

  return {
    event,
    budgetRows,
    totalPlanned,
    totalActual,
    attendeeCount,
    costPerYouthCents:
      attendeeCount > 0 ? Math.round(totalPlanned / attendeeCount) : 0,
    price,
    expectedRevenueCents: expectedRevenue,
    collectedCents: collected,
    // Marge : la somme des contributions (pondérées par tranche) couvre-t-elle
    // le budget prévu ? ≥ 0 ⇒ « équilibré » (objectif « 0 à la fin »).
    marginCents: expectedRevenue - totalPlanned,
    registrations: detailed,
    // US-F14 — tickets de caisse (dépenses) rattachés à l'événement.
    tickets: expenses.map((e) => ({
      id: e.id,
      amountCents: e.amountCents,
      category: e.category,
      date: e.date,
      receiptUrl: e.receiptUrl,
      status: e.status,
      note: e.note,
      declarant: e.declarant
        ? `${e.declarant.firstName} ${e.declarant.lastName}`
        : "—",
    })),
    ticketsTotalCents: expenses.reduce((a, e) => a + e.amountCents, 0),
  };
}

export type EventBudget = NonNullable<
  Awaited<ReturnType<typeof getEventBudget>>
>;
