import "server-only";

import { db } from "@/lib/db";

// US-S03 — fiche progression consolidée d'un jeune : frise d'étapes (avec
// statut de validation), badges obtenus, objectifs, notes (sensibles) et
// prochaine étape suggérée.

export async function getProgression(jeuneId: string, includeNotes: boolean) {
  const jeune = await db.user.findUnique({
    where: { id: jeuneId },
    select: { id: true, firstName: true, lastName: true, image: true, unit: true },
  });
  if (!jeune) return null;

  const [steps, validations, awards, goals, notes] = await Promise.all([
    jeune.unit
      ? db.progressionStep.findMany({
          where: { unit: jeune.unit, archived: false },
          orderBy: { order: "asc" },
        })
      : Promise.resolve([]),
    db.stepValidation.findMany({ where: { userId: jeuneId } }),
    db.badgeAward.findMany({
      where: { userId: jeuneId },
      orderBy: { awardedAt: "desc" },
      include: { badge: true },
    }),
    db.pedagogicalGoal.findMany({
      where: { userId: jeuneId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        step: { select: { name: true } },
        badge: { select: { name: true, icon: true } },
      },
    }),
    includeNotes
      ? db.pedagogicalNote.findMany({
          where: { userId: jeuneId },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const validationByStep = new Map(validations.map((v) => [v.stepId, v]));

  // Résout les noms des chefs (validations + auteurs de notes) en une requête.
  const actorIds = new Set<string>();
  for (const v of validations) {
    if (v.proposedById) actorIds.add(v.proposedById);
    if (v.confirmedById) actorIds.add(v.confirmedById);
  }
  for (const n of notes) if (n.authorId) actorIds.add(n.authorId);
  const actors = actorIds.size
    ? await db.user.findMany({
        where: { id: { in: [...actorIds] } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const stepRows = steps.map((s) => {
    const v = validationByStep.get(s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      status: (v?.status ?? "NONE") as "NONE" | "PROPOSED" | "CONFIRMED",
      proposedBy: v?.proposedById ? (actorById.get(v.proposedById) ?? null) : null,
      confirmedBy: v?.confirmedById ? (actorById.get(v.confirmedById) ?? null) : null,
      confirmedAt: v?.confirmedAt ?? null,
    };
  });

  // Prochaine étape suggérée : 1re étape non confirmée.
  const nextStep = stepRows.find((s) => s.status !== "CONFIRMED") ?? null;

  const confirmedCount = stepRows.filter((s) => s.status === "CONFIRMED").length;

  return {
    jeune,
    steps: stepRows,
    nextStep,
    confirmedCount,
    totalSteps: stepRows.length,
    badges: awards.map((a) => ({
      awardId: a.id,
      badgeId: a.badgeId,
      name: a.badge.name,
      icon: a.badge.icon,
      awardedAt: a.awardedAt,
    })),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status as "IN_PROGRESS" | "ACHIEVED",
      dueDate: g.dueDate,
      target: g.step?.name ?? (g.badge ? `${g.badge.icon ?? ""} ${g.badge.name}`.trim() : null),
    })),
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      author: n.authorId ? (actorById.get(n.authorId) ?? null) : null,
    })),
  };
}

export type Progression = NonNullable<Awaited<ReturnType<typeof getProgression>>>;
