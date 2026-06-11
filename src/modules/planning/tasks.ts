import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

// US-P10 — tâches (to-do) du planning.

export type TaskStatusFilter = "open" | "done" | "all";

const TASK_SELECT = {
  id: true,
  title: true,
  dueDate: true,
  done: true,
  doneAt: true,
  recurrence: true,
  recurrenceEvery: true,
  groupTask: true,
  minRequired: true,
  assignee: {
    select: { id: true, firstName: true, lastName: true, image: true },
  },
  signups: {
    orderBy: { createdAt: "asc" },
    select: {
      user: { select: { id: true, firstName: true, lastName: true, image: true } },
    },
  },
} as const;

// Tri : à faire avant faites ; puis par échéance croissante (sans échéance en
// dernier) ; puis par date de création. Trié en mémoire (volume modeste) pour
// éviter les différences de gestion des NULL selon le connecteur.
function sortTasks<
  T extends { done: boolean; dueDate: Date | null; id: string },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.dueDate ? a.dueDate.getTime() : Infinity;
    const bd = b.dueDate ? b.dueDate.getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return 0;
  });
}

export async function listTasks(
  opts: { status?: TaskStatusFilter; assigneeId?: string } = {},
) {
  const where: Prisma.TaskWhereInput = {};
  if (opts.status === "open") where.done = false;
  if (opts.status === "done") where.done = true;
  if (opts.assigneeId) where.assigneeId = opts.assigneeId;

  const tasks = await db.task.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: TASK_SELECT,
  });
  return sortTasks(tasks);
}

export type TaskListItem = Awaited<ReturnType<typeof listTasks>>[number];

// Aperçu des tâches à faire (pour la page planning).
export async function listOpenTasksPreview(limit = 5) {
  const tasks = await db.task.findMany({
    where: { done: false },
    orderBy: { createdAt: "asc" },
    select: TASK_SELECT,
  });
  return sortTasks(tasks).slice(0, limit);
}

export async function countOpenTasks() {
  return db.task.count({ where: { done: false } });
}

// US-P11 — tâches de groupe ouvertes (pour le tableau de bord).
export async function listOpenGroupTasks() {
  const tasks = await db.task.findMany({
    where: { done: false, groupTask: true },
    orderBy: { createdAt: "asc" },
    select: TASK_SELECT,
  });
  return sortTasks(tasks);
}
