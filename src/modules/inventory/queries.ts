import { db } from "@/lib/db";

const ACTIVE_LOAN_STATUSES = ["ACTIF", "RETARD", "SECHAGE"] as const;

/**
 * Agrège tout ce dont le dashboard a besoin en un seul appel — `Promise.all`
 * pour exécuter en parallèle, et calculs JS pour les agrégats qui sortent
 * du SQL standard (articles "disponibles" = articles avec au moins 1 unité libre).
 */
export async function getDashboardData() {
  const [equipmentList, activeLoanCount, openIncidentCount, lateLoans] =
    await Promise.all([
      db.equipment.findMany({
        where: { archived: false },
        select: {
          id: true,
          totalQty: true,
          loans: {
            where: { status: { in: [...ACTIVE_LOAN_STATUSES] } },
            select: { quantity: true },
          },
        },
      }),
      db.loan.count({
        where: { status: { in: [...ACTIVE_LOAN_STATUSES] } },
      }),
      db.incident.count({
        where: { resolvedAt: null },
      }),
      db.loan.findMany({
        where: {
          OR: [
            { status: "RETARD" },
            { AND: [{ status: "ACTIF" }, { expectedReturn: { lt: new Date() } }] },
          ],
        },
        orderBy: { expectedReturn: "asc" },
        select: {
          id: true,
          expectedReturn: true,
          eventName: true,
          equipment: { select: { name: true } },
          borrower: { select: { firstName: true, lastName: true, phone: true } },
        },
      }),
    ]);

  const availableArticleCount = equipmentList.filter((eq) => {
    const loanedQty = eq.loans.reduce((sum, l) => sum + l.quantity, 0);
    return loanedQty < eq.totalQty;
  }).length;

  return {
    availableArticleCount,
    activeLoanCount,
    openIncidentCount,
    lateLoans,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
