// Issue #189 — règle UNIQUE du retard de prêt, partagée par la liste et le
// filtre « En retard », le badge, la fiche membre, le tableau de bord,
// l'alerte (overdue.ts) et le calcul de disponibilité (availability.ts).
//
// Un prêt est en retard une fois écoulée la JOURNÉE de retour prévue : à rendre
// aujourd'hui, il n'est en retard qu'à partir de demain 00:00. Les dates sont
// des heures murales (cf. src/lib/datetime.ts) : `now` vaut wallNow(), jamais
// new Date().

import type { Prisma } from "@prisma/client";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Début du jour mural de `now` : tout retour prévu avant cet instant est dépassé. */
export function overdueCutoff(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** La journée de retour prévue est écoulée (statut non pris en compte). */
export function isPastDue(expectedReturn: Date, now: Date): boolean {
  return expectedReturn < overdueCutoff(now);
}

/** Prêt en retard : statut RETARD saisi, ou ACTIF dont la journée de retour est écoulée. */
export function isLoanLate(
  loan: { status: string; expectedReturn: Date },
  now: Date,
): boolean {
  return (
    loan.status === "RETARD" ||
    (loan.status === "ACTIF" && isPastDue(loan.expectedReturn, now))
  );
}

/** Même règle que isLoanLate, en filtre Prisma. */
export function lateLoanWhere(now: Date): Prisma.LoanWhereInput {
  return {
    OR: [
      { status: "RETARD" },
      { status: "ACTIF", expectedReturn: { lt: overdueCutoff(now) } },
    ],
  };
}

/** Jours calendaires écoulés depuis la journée de retour prévue (0 si pas dépassée). */
export function daysLate(expectedReturn: Date, now: Date): number {
  const ms = overdueCutoff(now).getTime() - overdueCutoff(expectedReturn).getTime();
  return Math.max(0, Math.round(ms / ONE_DAY_MS));
}
