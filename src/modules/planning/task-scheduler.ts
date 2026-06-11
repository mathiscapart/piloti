import "server-only";

import { db } from "@/lib/db";
import { notify, notifyMany } from "@/modules/notifications/notify";

import { nextOccurrenceData } from "./recurrence";

// US-P11 — combien d'heures avant l'échéance d'une tâche de groupe on relance.
const LEAD_HOURS = Number(process.env.TASK_REMINDER_LEAD_HOURS) || 48;

// Régénère l'occurrence suivante des tâches récurrentes échues non encore
// régénérées (« une fois à l'échéance, la suivante est générée »).
export async function processRecurringTasks(): Promise<number> {
  const now = new Date();
  const dueTasks = await db.task.findMany({
    where: {
      recurrence: { not: "NONE" },
      nextGenerated: false,
      dueDate: { lt: now },
    },
    select: {
      id: true,
      title: true,
      recurrence: true,
      recurrenceEvery: true,
      groupTask: true,
      minRequired: true,
      createdById: true,
      dueDate: true,
    },
  });

  let generated = 0;
  for (const task of dueTasks) {
    try {
      await db.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: task.id },
          data: { nextGenerated: true },
        });
        await tx.task.create({ data: nextOccurrenceData(task) });
      });
      generated++;
    } catch (err) {
      console.error("[scheduler] régénération de tâche échouée:", err);
    }
  }
  return generated;
}

// Rappels / relances des tâches de groupe dont l'échéance approche.
//  - aucun inscrit  → relance au groupe ;
//  - sous le minimum → relance au groupe ;
//  - couverte        → rappel aux inscrits.
// Une seule notification par occurrence (dédup via reminderSentAt).
export async function sendTaskReminders(): Promise<number> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + LEAD_HOURS * 3_600_000);

  const tasks = await db.task.findMany({
    where: {
      groupTask: true,
      done: false,
      reminderSentAt: null,
      dueDate: { gt: now, lte: windowEnd },
    },
    select: {
      id: true,
      title: true,
      minRequired: true,
      signups: { select: { userId: true } },
    },
  });
  if (tasks.length === 0) return 0;

  const groupUsers = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  const groupIds = groupUsers.map((u) => u.id);

  let sent = 0;
  for (const task of tasks) {
    const signupIds = task.signups.map((s) => s.userId);
    const covered = signupIds.length > 0 && signupIds.length >= task.minRequired;

    // Dédup : on marque la relance envoyée AVANT l'envoi.
    await db.task.update({
      where: { id: task.id },
      data: { reminderSentAt: new Date() },
    });

    if (signupIds.length === 0) {
      await notifyMany(groupIds, (userId) => ({
        userId,
        type: "TASK_REMINDER",
        title: `Tâche sans volontaire : ${task.title}`,
        body: "Personne n'est encore inscrit et l'échéance approche.",
        link: "/planning/taches",
        messageId: task.id,
      }));
    } else if (!covered) {
      await notifyMany(groupIds, (userId) => ({
        userId,
        type: "TASK_REMINDER",
        title: `Renfort demandé : ${task.title}`,
        body: `${signupIds.length}/${task.minRequired} inscrits — il manque du monde.`,
        link: "/planning/taches",
        messageId: task.id,
      }));
    } else {
      await Promise.allSettled(
        signupIds.map((userId) =>
          notify({
            userId,
            type: "TASK_REMINDER",
            title: `Rappel : ${task.title}`,
            body: "L'échéance approche.",
            link: "/planning/taches",
            messageId: task.id,
          }),
        ),
      );
    }
    sent++;
  }
  return sent;
}
