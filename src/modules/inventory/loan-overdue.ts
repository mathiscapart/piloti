// Issue #189 (D-047) — règle UNIQUE du retard de prêt, partagée par la liste et
// le filtre « En retard », le badge, la fiche membre, le tableau de bord,
// l'alerte (overdue.ts) et le calcul de disponibilité (availability.ts).
//
// Un prêt est en retard dès l'INSTANT de retour prévu dépassé. Une date saisie
// sans heure vaut 00:00 : un prêt à rendre aujourd'hui est en retard dès minuit.
// Les dates sont des heures murales (cf. src/lib/datetime.ts) : `now` vaut
// wallNow(), jamais new Date().

import type { Prisma } from "@prisma/client";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** L'instant de retour prévu est dépassé (statut non pris en compte). */
export function isPastDue(expectedReturn: Date, now: Date): boolean {
  return expectedReturn < now;
}

/** Prêt en retard : statut RETARD saisi, ou ACTIF dont l'instant de retour est dépassé. */
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
    OR: [{ status: "RETARD" }, { status: "ACTIF", expectedReturn: { lt: now } }],
  };
}

/** Jours entiers écoulés depuis l'instant de retour prévu (0 s'il n'est pas dépassé). */
export function daysLate(expectedReturn: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - expectedReturn.getTime()) / ONE_DAY_MS));
}
