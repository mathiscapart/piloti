"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { RECURRENCES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { postGroupTaskToChannel } from "./event-hooks";
import { nextOccurrenceData } from "./recurrence";

// Échéance saisie en date « murale » (« YYYY-MM-DD ») → minuit UTC, pour un
// affichage sans décalage de fuseau (cohérent avec le module événements).
function parseDueDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

export async function createTask(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "task.manage")) {
    return { error: "Réservé aux chefs." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) return { error: "Titre requis." };
  if (title.length > 200) return { error: "Titre trop long." };

  const assigneeRaw = String(formData.get("assigneeId") ?? "").trim();
  const dueDate = parseDueDate(String(formData.get("dueDate") ?? "") || null);

  // US-P11 — récurrence + tâche de groupe.
  const recurrenceRaw = String(formData.get("recurrence") ?? "NONE");
  const recurrence = (RECURRENCES as readonly string[]).includes(recurrenceRaw)
    ? recurrenceRaw
    : "NONE";
  const recurrenceEvery = Math.min(
    52,
    Math.max(1, Number(formData.get("recurrenceEvery")) || 1),
  );
  const groupTask = formData.get("groupTask") === "on";
  const minRequired = Math.max(0, Number(formData.get("minRequired")) || 0);

  if (recurrence !== "NONE" && !dueDate) {
    return { error: "Une tâche récurrente nécessite une échéance." };
  }

  let assigneeId: string | null = null;
  if (assigneeRaw) {
    const assignee = await db.user.findUnique({
      where: { id: assigneeRaw },
      select: { id: true },
    });
    if (!assignee) return { error: "Responsable introuvable." };
    assigneeId = assignee.id;
  }

  await withAudit(
    (tx) =>
      tx.task.create({
        data: {
          title,
          assigneeId,
          dueDate,
          recurrence,
          recurrenceEvery,
          groupTask,
          minRequired: groupTask ? minRequired : 0,
          createdById: user.id,
        },
      }),
    (task) => ({
      action: "TASK_CREATED",
      userId: user.id,
      metadata: { taskId: task.id, title, recurrence, groupTask },
    }),
  );

  // Fixation logique : une tâche de groupe est annoncée dans le salon général.
  if (groupTask) {
    after(() => postGroupTaskToChannel(title, user.id));
  }

  revalidatePath("/planning/taches");
  revalidatePath("/planning");
  return { error: null };
}

// Coche / décoche une tâche. Autorisé au chef (task.manage) ou au responsable
// de la tâche.
export async function toggleTask(taskId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      done: true,
      assigneeId: true,
      title: true,
      recurrence: true,
      recurrenceEvery: true,
      groupTask: true,
      minRequired: true,
      nextGenerated: true,
      createdById: true,
      dueDate: true,
      // Un inscrit peut clôturer une tâche de groupe.
      signups: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!task) return { error: "Tâche introuvable." };

  const isSignedUp = task.signups.length > 0;
  const allowed =
    can(user, "task.manage") ||
    task.assigneeId === user.id ||
    (task.groupTask && isSignedUp);
  if (!allowed) return { error: "Tu ne peux modifier que tes tâches." };

  const next = !task.done;
  // US-P11 — à la clôture d'une tâche récurrente, on génère l'occurrence suivante.
  const shouldGenerate =
    next && task.recurrence !== "NONE" && !task.nextGenerated && !!task.dueDate;

  await withAudit(
    async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          done: next,
          doneAt: next ? new Date() : null,
          ...(shouldGenerate ? { nextGenerated: true } : {}),
        },
      });
      if (shouldGenerate) {
        await tx.task.create({ data: nextOccurrenceData(task) });
      }
      return updated;
    },
    {
      action: "TASK_UPDATED",
      userId: user.id,
      metadata: { taskId, done: next, generated: shouldGenerate },
    },
  );

  revalidatePath("/planning/taches");
  revalidatePath("/planning");
  return { error: null };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "task.manage")) {
    return { error: "Réservé aux chefs." };
  }
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { title: true },
  });
  if (!task) return { error: "Tâche introuvable." };

  await withAudit((tx) => tx.task.delete({ where: { id: taskId } }), {
    action: "TASK_DELETED",
    userId: user.id,
    metadata: { taskId, title: task.title },
  });

  revalidatePath("/planning/taches");
  revalidatePath("/planning");
  return { error: null };
}

// US-P11 — s'inscrire / se désinscrire d'une tâche ouverte au groupe.
export async function toggleTaskSignup(taskId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, groupTask: true, done: true },
  });
  if (!task) return { error: "Tâche introuvable." };
  if (!task.groupTask) return { error: "Cette tâche n'est pas ouverte au groupe." };
  if (task.done) return { error: "Cette tâche est déjà faite." };

  const existing = await db.taskSignup.findUnique({
    where: { taskId_userId: { taskId, userId: user.id } },
    select: { id: true },
  });

  await withAudit(
    (tx) =>
      existing
        ? tx.taskSignup.delete({ where: { id: existing.id } })
        : tx.taskSignup.create({ data: { taskId, userId: user.id } }),
    {
      action: "TASK_SIGNUP",
      userId: user.id,
      metadata: { taskId, signedUp: !existing },
    },
  );

  revalidatePath("/planning/taches");
  revalidatePath("/dashboard");
  return { error: null };
}
