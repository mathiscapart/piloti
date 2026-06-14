"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { notifyMany } from "@/modules/notifications/notify";

// US-S04…S07 — actions du suivi pédagogique sur un jeune (chef : pedago.manage).

// Jeune + ses parents (liens familiaux) — destinataires des notifications.
async function jeuneAndParents(jeuneId: string): Promise<string[]> {
  const links = await db.familyLink.findMany({
    where: { childId: jeuneId },
    select: { parentId: true },
  });
  return [jeuneId, ...links.map((l) => l.parentId)];
}

function parseWallDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

// ── US-S04 — validation d'étape (workflow à 2 chefs) ────────────────────────

export async function proposeStep(
  jeuneId: string,
  stepId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };

  const [jeune, step, existing] = await Promise.all([
    db.user.findUnique({ where: { id: jeuneId }, select: { id: true, unit: true, firstName: true } }),
    db.progressionStep.findUnique({ where: { id: stepId }, select: { id: true, name: true } }),
    db.stepValidation.findUnique({ where: { stepId_userId: { stepId, userId: jeuneId } } }),
  ]);
  if (!jeune || !step) return { error: "Jeune ou étape introuvable." };
  if (existing) return { error: "Validation déjà en cours ou confirmée." };

  await withAudit(
    (tx) =>
      tx.stepValidation.create({
        data: { stepId, userId: jeuneId, status: "PROPOSED", proposedById: user.id },
      }),
    { action: "STEP_VALIDATION_PROPOSED", userId: user.id, metadata: { jeuneId, stepId } },
  );

  // Notifie les autres chefs de la branche pour la 2e validation.
  after(async () => {
    const chefs = await db.user.findMany({
      where: { status: "ACTIVE", roles: { contains: "CHEF" }, unit: jeune.unit },
      select: { id: true },
    });
    const others = chefs.map((c) => c.id).filter((id) => id !== user.id);
    await notifyMany(others, (uid) => ({
      userId: uid,
      type: "STEP_VALIDATION_REQUEST",
      title: "Validation d'étape à confirmer",
      body: `${user.firstName} propose de valider « ${step.name} » pour ${jeune.firstName}. Une 2e confirmation est requise.`,
      link: `/membres/${jeuneId}/progression`,
      messageId: `stepval-${stepId}-${jeuneId}`,
    }));
  });

  revalidatePath(`/membres/${jeuneId}/progression`);
  return { error: null };
}

export async function confirmStep(
  jeuneId: string,
  stepId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };

  const validation = await db.stepValidation.findUnique({
    where: { stepId_userId: { stepId, userId: jeuneId } },
  });
  if (!validation) return { error: "Aucune proposition à confirmer." };
  if (validation.status === "CONFIRMED") return { error: "Étape déjà validée." };
  // Règle des 2 chefs : le confirmateur doit différer du proposeur.
  if (validation.proposedById === user.id) {
    return { error: "Un autre chef doit confirmer cette étape (validation à 2)." };
  }

  const [jeune, step] = await Promise.all([
    db.user.findUnique({ where: { id: jeuneId }, select: { firstName: true } }),
    db.progressionStep.findUnique({ where: { id: stepId }, select: { name: true } }),
  ]);

  await withAudit(
    (tx) =>
      tx.stepValidation.update({
        where: { id: validation.id },
        data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() },
      }),
    { action: "STEP_VALIDATION_CONFIRMED", userId: user.id, metadata: { jeuneId, stepId } },
  );

  after(async () => {
    const recipients = await jeuneAndParents(jeuneId);
    await notifyMany(recipients, (uid) => ({
      userId: uid,
      type: "STEP_VALIDATED",
      title: "Étape validée 🎉",
      body: `L'étape « ${step?.name ?? ""} » a été validée pour ${jeune?.firstName ?? "le jeune"}.`,
      link: `/membres/${jeuneId}/progression`,
      messageId: `stepvalidated-${stepId}-${jeuneId}`,
    }));
  });

  revalidatePath(`/membres/${jeuneId}/progression`);
  return { error: null };
}

export async function removeValidation(
  jeuneId: string,
  stepId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const validation = await db.stepValidation.findUnique({
    where: { stepId_userId: { stepId, userId: jeuneId } },
    select: { id: true },
  });
  if (!validation) return { error: "Validation introuvable." };

  await withAudit(
    (tx) => tx.stepValidation.delete({ where: { id: validation.id } }),
    { action: "STEP_VALIDATION_REMOVED", userId: user.id, metadata: { jeuneId, stepId } },
  );
  revalidatePath(`/membres/${jeuneId}/progression`);
  return { error: null };
}

// ── US-S05 — attribution de badge (multi-jeunes) ────────────────────────────

export async function awardBadge(
  badgeId: string,
  jeuneIds: string[],
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const badge = await db.badge.findUnique({ where: { id: badgeId }, select: { id: true, name: true, icon: true } });
  if (!badge) return { error: "Badge introuvable." };
  if (jeuneIds.length === 0) return { error: "Sélectionne au moins un jeune." };

  // Évite les doublons (contrainte unique badgeId+userId).
  const already = await db.badgeAward.findMany({
    where: { badgeId, userId: { in: jeuneIds } },
    select: { userId: true },
  });
  const skip = new Set(already.map((a) => a.userId));
  const targets = jeuneIds.filter((id) => !skip.has(id));
  if (targets.length === 0) return { error: "Badge déjà attribué à ces jeunes." };

  await withAudit(
    (tx) =>
      tx.badgeAward.createMany({
        data: targets.map((userId) => ({ badgeId, userId, awardedById: user.id })),
      }),
    { action: "BADGE_AWARD_GRANTED", userId: user.id, metadata: { badgeId, count: targets.length } },
  );

  const badgeLabel = `${badge.icon ?? ""} ${badge.name}`.trim();
  after(async () => {
    for (const jeuneId of targets) {
      const recipients = await jeuneAndParents(jeuneId);
      await notifyMany(recipients, (uid) => ({
        userId: uid,
        type: "BADGE_AWARDED",
        title: "Nouveau badge 🏅",
        body: `Le badge « ${badgeLabel} » vient d'être attribué.`,
        link: `/membres/${jeuneId}/progression`,
        messageId: `badge-${badgeId}-${jeuneId}`,
      }));
    }
  });

  revalidatePath(`/membres`);
  return { error: null };
}

export async function revokeBadge(awardId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const award = await db.badgeAward.findUnique({ where: { id: awardId }, select: { id: true, userId: true } });
  if (!award) return { error: "Attribution introuvable." };

  await withAudit(
    (tx) => tx.badgeAward.delete({ where: { id: awardId } }),
    { action: "BADGE_AWARD_REVOKED", userId: user.id, metadata: { awardId } },
  );
  revalidatePath(`/membres/${award.userId}/progression`);
  return { error: null };
}

// ── US-S06 — objectif personnel ─────────────────────────────────────────────

export async function setGoal(
  jeuneId: string,
  title: string,
  dueDate: string,
  stepId: string,
  badgeId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const trimmed = title.trim();
  if (!trimmed) return { error: "Intitulé requis." };

  let due: Date | null = null;
  if (dueDate.trim()) {
    due = parseWallDate(dueDate);
    if (!due) return { error: "Date d'échéance invalide." };
  }

  await withAudit(
    (tx) =>
      tx.pedagogicalGoal.create({
        data: {
          userId: jeuneId,
          title: trimmed,
          dueDate: due,
          stepId: stepId.trim() || null,
          badgeId: badgeId.trim() || null,
          createdById: user.id,
        },
      }),
    (g) => ({ action: "PEDAGO_GOAL_SET", userId: user.id, metadata: { jeuneId, goalId: g.id } }),
  );
  revalidatePath(`/membres/${jeuneId}/progression`);
  return { error: null };
}

export async function toggleGoal(goalId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const goal = await db.pedagogicalGoal.findUnique({ where: { id: goalId } });
  if (!goal) return { error: "Objectif introuvable." };

  const achieved = goal.status !== "ACHIEVED";
  await withAudit(
    (tx) =>
      tx.pedagogicalGoal.update({
        where: { id: goalId },
        data: {
          status: achieved ? "ACHIEVED" : "IN_PROGRESS",
          achievedAt: achieved ? new Date() : null,
        },
      }),
    { action: "PEDAGO_GOAL_UPDATED", userId: user.id, metadata: { goalId, achieved } },
  );
  revalidatePath(`/membres/${goal.userId}/progression`);
  return { error: null };
}

export async function deleteGoal(goalId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const goal = await db.pedagogicalGoal.findUnique({ where: { id: goalId }, select: { id: true, userId: true } });
  if (!goal) return { error: "Objectif introuvable." };

  await withAudit(
    (tx) => tx.pedagogicalGoal.delete({ where: { id: goalId } }),
    { action: "PEDAGO_GOAL_UPDATED", userId: user.id, metadata: { goalId, deleted: true } },
  );
  revalidatePath(`/membres/${goal.userId}/progression`);
  return { error: null };
}

// ── US-S07 — note de suivi (sensible) ───────────────────────────────────────

export async function addNote(jeuneId: string, content: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const trimmed = content.trim();
  if (!trimmed) return { error: "Note vide." };
  const jeune = await db.user.findUnique({ where: { id: jeuneId }, select: { id: true } });
  if (!jeune) return { error: "Jeune introuvable." };

  await withAudit(
    (tx) =>
      tx.pedagogicalNote.create({
        data: { userId: jeuneId, authorId: user.id, content: trimmed },
      }),
    { action: "PEDAGO_NOTE_ADDED", userId: user.id, metadata: { jeuneId } },
  );
  revalidatePath(`/membres/${jeuneId}/progression`);
  return { error: null };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
  const note = await db.pedagogicalNote.findUnique({ where: { id: noteId }, select: { id: true, userId: true } });
  if (!note) return { error: "Note introuvable." };

  await withAudit(
    (tx) => tx.pedagogicalNote.delete({ where: { id: noteId } }),
    { action: "PEDAGO_NOTE_ADDED", userId: user.id, metadata: { noteId, deleted: true } },
  );
  revalidatePath(`/membres/${note.userId}/progression`);
  return { error: null };
}
