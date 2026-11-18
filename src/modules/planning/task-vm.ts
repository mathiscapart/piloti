import { formatWall, wallNow } from "@/lib/datetime";
import { RECURRENCE_LABEL, type Recurrence } from "@/lib/enums";

import type { TaskListItem } from "./tasks";

// Vue-modèle d'une tâche pour l'affichage (page tâches + tableau de bord).
export interface TaskVM {
  id: string;
  title: string;
  done: boolean;
  assigneeFirst: string | null;
  assigneeLast: string | null;
  assigneeImage: string | null;
  dueLabel: string | null;
  overdue: boolean;
  canToggle: boolean;
  canDelete: boolean;
  recurrenceLabel: string | null;
  groupTask: boolean;
  minRequired: number;
  signupCount: number;
  signupNames: string;
  mySignup: boolean;
  covered: boolean;
}

// #75 — l'année n'est affichée que si elle diffère de l'année courante.
export function dueLabel(due: Date, now: Date): string {
  return formatWall(due, due.getUTCFullYear() === now.getUTCFullYear() ? "dayMonth" : "date");
}

export function buildTaskVMs(
  tasks: TaskListItem[],
  opts: { userId: string; canManage: boolean },
): TaskVM[] {
  // Échéance murale : « aujourd'hui » est le jour de Paris, pas celui d'UTC.
  const now = wallNow();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return tasks.map((t) => {
    const signupCount = t.signups.length;
    const mySignup = t.signups.some((s) => s.user.id === opts.userId);
    return {
      id: t.id,
      title: t.title,
      done: t.done,
      assigneeFirst: t.assignee?.firstName ?? null,
      assigneeLast: t.assignee?.lastName ?? null,
      assigneeImage: t.assignee?.image ?? null,
      dueLabel: t.dueDate ? dueLabel(t.dueDate, now) : null,
      overdue: !t.done && t.dueDate ? t.dueDate.getTime() < todayUtc : false,
      canToggle:
        opts.canManage ||
        t.assignee?.id === opts.userId ||
        (t.groupTask && mySignup),
      canDelete: opts.canManage,
      recurrenceLabel:
        t.recurrence !== "NONE"
          ? RECURRENCE_LABEL[t.recurrence as Recurrence]
          : null,
      groupTask: t.groupTask,
      minRequired: t.minRequired,
      signupCount,
      signupNames: t.signups
        .map((s) => `${s.user.firstName} ${s.user.lastName}`)
        .join(", "),
      mySignup,
      covered: signupCount > 0 && signupCount >= t.minRequired,
    };
  });
}
