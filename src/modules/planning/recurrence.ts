import type { Recurrence } from "@/lib/enums";

// US-P11 — avance une date d'échéance selon la fréquence et l'intervalle.
// Opère sur les composantes UTC (dates « murales », cf. tâches/événements).
export function advanceDate(
  date: Date,
  recurrence: Recurrence,
  every: number,
): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const n = Math.max(1, every);
  switch (recurrence) {
    case "DAILY":
      return new Date(Date.UTC(y, m, d + n));
    case "WEEKLY":
      return new Date(Date.UTC(y, m, d + 7 * n));
    case "MONTHLY":
      return addMonthsClamped(y, m + n, d);
    case "YEARLY":
      return addMonthsClamped(y + n, m, d);
    default:
      return date;
  }
}

// #195 — plafonne au dernier jour du mois cible (31/01 → 28/02, pas 03/03).
// Ne voyant que la date précédente, la série reste ensuite au jour plafonné.
function addMonthsClamped(y: number, m: number, d: number): Date {
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay)));
}

// Données de l'occurrence suivante d'une tâche récurrente (échéance avancée,
// statut/inscriptions remis à zéro). Le responsable n'est conservé que s'il est
// ACTIVE (#113) : suspendu, anonymisé ou tout autre statut, il n'est pas
// reconduit (décision PR #191).
// Partagé par la coche et le scheduler.
export function nextOccurrenceData(task: {
  title: string;
  recurrence: string;
  recurrenceEvery: number;
  groupTask: boolean;
  minRequired: number;
  createdById: string | null;
  assigneeId: string | null;
  assignee: { status: string } | null;
  dueDate: Date | null;
}) {
  return {
    title: task.title,
    recurrence: task.recurrence,
    recurrenceEvery: task.recurrenceEvery,
    groupTask: task.groupTask,
    minRequired: task.minRequired,
    createdById: task.createdById,
    assigneeId: task.assignee?.status === "ACTIVE" ? task.assigneeId : null,
    dueDate: task.dueDate
      ? advanceDate(task.dueDate, task.recurrence as Recurrence, task.recurrenceEvery)
      : null,
  };
}
