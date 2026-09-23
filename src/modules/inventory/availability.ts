// US-12 / issue #73 — disponibilité d'un article sur une période de prêt.
// Source unique de la règle, partagée par le wizard (`listBorrowableEquipment`)
// et le contrôle serveur (`createLoan`). Les prêts passés ici sont les prêts
// ACTIFS de l'article (`ACTIVE_LOAN_STATUSES`, séchage compris).

type LoanSpan = { startDate: Date; expectedReturn: Date; quantity: number };
type Period = { start: Date; end: Date };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Les dates de prêt sont des jours (00:00 UTC) : un prêt n'est en retard qu'une
// fois sa journée de retour prévue écoulée — rendu le matin, il peut repartir.
export function isOverdue(
  loan: Pick<LoanSpan, "expectedReturn">,
  now: Date,
): boolean {
  return loan.expectedReturn.getTime() + ONE_DAY_MS <= now.getTime();
}

// Un prêt en retard bloque l'article indéfiniment : il n'est physiquement pas
// au local tant qu'il n'est pas rendu.
function blocks(loan: LoanSpan, period: Period, now: Date): boolean {
  if (loan.startDate > period.end) return false;
  if (isOverdue(loan, now)) return true;
  // Deux périodes se chevauchent ssi start1 <= end2 && start2 <= end1.
  return loan.expectedReturn >= period.start;
}

export function blockingLoans<L extends LoanSpan>(
  loans: L[],
  period: Period,
  now: Date,
): L[] {
  return loans.filter((loan) => blocks(loan, period, now));
}

export function availableQtyForPeriod(
  totalQty: number,
  loans: LoanSpan[],
  period: Period,
  now: Date,
): number {
  const loaned = blockingLoans(loans, period, now).reduce(
    (sum, loan) => sum + loan.quantity,
    0,
  );
  return Math.max(0, totalQty - loaned);
}
