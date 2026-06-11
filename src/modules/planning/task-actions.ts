"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

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
        data: { title, assigneeId, dueDate, createdById: user.id },
      }),
    (task) => ({
      action: "TASK_CREATED",
      userId: user.id,
      metadata: { taskId: task.id, title, assigneeId },
    }),
  );

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
    select: { id: true, done: true, assigneeId: true },
  });
  if (!task) return { error: "Tâche introuvable." };

  const allowed = can(user, "task.manage") || task.assigneeId === user.id;
  if (!allowed) return { error: "Tu ne peux modifier que tes tâches." };

  const next = !task.done;
  await withAudit(
    (tx) =>
      tx.task.update({
        where: { id: taskId },
        data: { done: next, doneAt: next ? new Date() : null },
      }),
    {
      action: "TASK_UPDATED",
      userId: user.id,
      metadata: { taskId, done: next },
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
