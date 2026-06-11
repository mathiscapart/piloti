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
      return new Date(Date.UTC(y, m + n, d));
    case "YEARLY":
      return new Date(Date.UTC(y + n, m, d));
    default:
      return date;
  }
}

// Données de l'occurrence suivante d'une tâche récurrente (échéance avancée,
// statut/inscriptions remis à zéro). Partagé par la coche et le scheduler.
export function nextOccurrenceData(task: {
  title: string;
  recurrence: string;
  recurrenceEvery: number;
  groupTask: boolean;
  minRequired: number;
  createdById: string | null;
  dueDate: Date | null;
}) {
  return {
    title: task.title,
    recurrence: task.recurrence,
    recurrenceEvery: task.recurrenceEvery,
    groupTask: task.groupTask,
    minRequired: task.minRequired,
    createdById: task.createdById,
    dueDate: task.dueDate
      ? advanceDate(task.dueDate, task.recurrence as Recurrence, task.recurrenceEvery)
      : null,
  };
}
