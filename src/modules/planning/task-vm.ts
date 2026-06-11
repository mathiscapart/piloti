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

const DUE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function buildTaskVMs(
  tasks: TaskListItem[],
  opts: { userId: string; canManage: boolean },
): TaskVM[] {
  const now = new Date();
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
      dueLabel: t.dueDate ? DUE_FMT.format(t.dueDate) : null,
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
