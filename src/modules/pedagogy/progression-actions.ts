"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, inUnitScope } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { notifyMany } from "@/modules/notifications/notify";

import { stepConfirmationError, stepProposalError } from "./step-proposal";

// US-S04…S07 — actions du suivi pédagogique sur un jeune (chef : pedago.manage).

// Périmètre d'unité : `pedago.manage` dit qu'un CHEF peut suivre des jeunes,
// pas qu'il peut suivre TOUS les jeunes. Chaque action d'écriture ci-dessous
// passe par `requirePedagoScope`, qui résout le jeune visé puis vérifie
// `inUnitScope`. La LECTURE (`pedago.view`) reste ouverte à tout l'encadrement :
// seule l'écriture — étapes, badges, objectifs et notes sensibles (US-S07) —
// est bornée à la branche. ADMIN et RG ne sont pas bornés (cf. `inUnitScope`).
const HORS_BRANCHE = "Ce jeune n'est pas dans ta branche.";

type PedagoScope =
  | { ok: false; result: ActionResult }
  | {
      ok: true;
      user: Awaited<ReturnType<typeof getCurrentUser>>;
      jeune: { id: string; unit: string | null; firstName: string };
    };

async function requirePedagoScope(jeuneId: string): Promise<PedagoScope> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) {
    return { ok: false, result: { error: "Permission refusée." } };
  }
  const jeune = await db.user.findUnique({
    where: { id: jeuneId },
    select: { id: true, unit: true, firstName: true },
  });
  if (!jeune) return { ok: false, result: { error: "Jeune introuvable." } };
  if (!inUnitScope(user, jeune.unit)) {
    return { ok: false, result: { error: HORS_BRANCHE } };
  }
  return { ok: true, user, jeune };
}

// Variante pour les actions qui reçoivent l'id d'une RESSOURCE (attribution,
// objectif, note) et non celui du jeune : le `can()` a déjà été fait en amont —
// on garde l'ordre conventionnel getCurrentUser() → can() → résolution — et il
// ne reste qu'à vérifier la branche du propriétaire de la ressource.
// Renvoie l'erreur à retourner, ou `null` si l'action peut continuer.
async function refuseIfOutOfScope(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  jeuneId: string,
): Promise<ActionResult | null> {
  const jeune = await db.user.findUnique({
    where: { id: jeuneId },
    select: { unit: true },
  });
  if (!jeune) return { error: "Jeune introuvable." };
  return inUnitScope(user, jeune.unit) ? null : { error: HORS_BRANCHE };
}

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

class StaleValidationError extends Error {}

export async function proposeStep(
  jeuneId: string,
  stepId: string,
): Promise<ActionResult> {
  const scope = await requirePedagoScope(jeuneId);
  if (!scope.ok) return scope.result;
  const { user, jeune } = scope;

  const [step, existing] = await Promise.all([
    db.progressionStep.findUnique({
      where: { id: stepId },
      select: { id: true, name: true, unit: true, archived: true },
    }),
    db.stepValidation.findUnique({ where: { stepId_userId: { stepId, userId: jeuneId } } }),
  ]);
  if (!step) return { error: "Étape introuvable." };
  const invalid = stepProposalError(step, jeune.unit);
  if (invalid) return { error: invalid };
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
  const scope = await requirePedagoScope(jeuneId);
  if (!scope.ok) return scope.result;
  const { user, jeune } = scope;

  const [validation, step] = await Promise.all([
    db.stepValidation.findUnique({
      where: { stepId_userId: { stepId, userId: jeuneId } },
      select: { id: true, status: true, proposedById: true },
    }),
    db.progressionStep.findUnique({
      where: { id: stepId },
      select: { name: true, unit: true, archived: true },
    }),
  ]);
  if (!validation) return { error: "Aucune proposition à confirmer." };
  if (!step) return { error: "Étape introuvable." };
  const invalid = stepConfirmationError(validation, step, jeune.unit, user.id);
  if (invalid) return { error: invalid };

  // Statut et étape ont été lus hors transaction : la confirmation n'a lieu que
  // si la ligne est toujours une proposition sur une étape non archivée (#152).
  // Sinon — retrait, confirmation concurrente ou archivage entre-temps — la
  // transaction est annulée, AuditLog compris, et la famille n'est pas notifiée.
  try {
    await withAudit(
      async (tx) => {
        const { count } = await tx.stepValidation.updateMany({
          where: { id: validation.id, status: "PROPOSED", step: { archived: false } },
          data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() },
        });
        if (count === 0) throw new StaleValidationError();
      },
      { action: "STEP_VALIDATION_CONFIRMED", userId: user.id, metadata: { jeuneId, stepId } },
    );
  } catch (err) {
    if (err instanceof StaleValidationError) {
      return { error: "Cette proposition a changé entre-temps, recharge la page." };
    }
    throw err;
  }

  after(async () => {
    const recipients = await jeuneAndParents(jeuneId);
    await notifyMany(recipients, (uid) => ({
      userId: uid,
      type: "STEP_VALIDATED",
      title: "Étape validée 🎉",
      body: `L'étape « ${step.name} » a été validée pour ${jeune.firstName}.`,
      link: `/membres/${jeuneId}/progression`,
      messageId: `stepvalidated-${stepId}-${jeuneId}`,
    }));
  });

  revalidatePath(`/membres/${jeuneId}/progression`);
  return { error: null };
}

// Deux régimes (#100) : une PROPOSITION se retire par les chefs de la branche
// (`pedago.manage`, comme les autres écritures) ; une étape CONFIRMÉE par deux
// chefs ne se défait pas par un seul — annulation réservée au RG et à l'ADMIN
// (`pedago.validation.cancel`), et la famille en est prévenue.
export async function removeValidation(
  jeuneId: string,
  stepId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const canCancelConfirmed = can(user, "pedago.validation.cancel");
  if (!canCancelConfirmed && !can(user, "pedago.manage")) {
    return { error: "Permission refusée." };
  }
  const validation = await db.stepValidation.findUnique({
    where: { stepId_userId: { stepId, userId: jeuneId } },
    select: {
      id: true,
      status: true,
      proposedById: true,
      confirmedById: true,
      step: { select: { name: true } },
    },
  });
  if (!validation) return { error: "Validation introuvable." };

  if (validation.status === "CONFIRMED") {
    if (!canCancelConfirmed) {
      return {
        error: "Seuls le responsable de groupe et l'admin peuvent annuler une étape validée.",
      };
    }
  } else {
    if (!can(user, "pedago.manage")) return { error: "Permission refusée." };
    const outOfScope = await refuseIfOutOfScope(user, jeuneId);
    if (outOfScope) return outOfScope;
  }

  const cancelled = validation.status === "CONFIRMED";
  // Le statut a été lu hors transaction : on ne supprime que s'il n'a pas changé.
  // Sans ce garde, une proposition confirmée entre-temps par un 2e chef serait
  // effacée par un chef seul, tracée comme simple retrait (#100). Lever annule
  // la transaction, AuditLog compris.
  try {
    await withAudit(
      async (tx) => {
        const { count } = await tx.stepValidation.deleteMany({
          where: { id: validation.id, status: validation.status },
        });
        if (count === 0) throw new StaleValidationError();
      },
      {
        action: cancelled ? "STEP_VALIDATION_CANCELLED" : "STEP_VALIDATION_REMOVED",
        userId: user.id,
        metadata: {
          jeuneId,
          stepId,
          proposedById: validation.proposedById,
          confirmedById: validation.confirmedById,
        },
      },
    );
  } catch (err) {
    if (err instanceof StaleValidationError) {
      return { error: "La validation a changé entre-temps, recharge la page." };
    }
    throw err;
  }

  if (cancelled) {
    after(async () => {
      const [recipients, jeune] = await Promise.all([
        jeuneAndParents(jeuneId),
        db.user.findUnique({ where: { id: jeuneId }, select: { firstName: true } }),
      ]);
      await notifyMany(recipients, (uid) => ({
        userId: uid,
        type: "STEP_VALIDATION_CANCELLED",
        title: "Validation d'étape annulée",
        body: `La validation de l'étape « ${validation.step.name} » a été annulée pour ${jeune?.firstName ?? ""}.`,
        link: `/membres/${jeuneId}/progression`,
        messageId: `stepcancelled-${stepId}-${jeuneId}`,
      }));
    });
  }

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

  // Périmètre d'unité sur une action MULTI-jeunes : on vérifie les unités en une
  // seule requête, et on rejette EN BLOC si un seul jeune est hors branche.
  // Filtrer silencieusement serait pire : l'AuditLog dirait « badge attribué »
  // sur un sous-ensemble, sans que le chef sache qui a été écarté.
  const uniques = [...new Set(jeuneIds)]; // un doublon ne doit pas passer pour un id inconnu
  const cibles = await db.user.findMany({
    where: { id: { in: uniques } },
    select: { id: true, unit: true },
  });
  if (cibles.length !== uniques.length) return { error: "Jeune introuvable." };
  if (cibles.some((j) => !inUnitScope(user, j.unit))) {
    return { error: "La sélection contient des jeunes hors de ta branche." };
  }

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
  const outOfScope = await refuseIfOutOfScope(user, award.userId);
  if (outOfScope) return outOfScope;

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
  const scope = await requirePedagoScope(jeuneId);
  if (!scope.ok) return scope.result;
  const { user } = scope;
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
  const outOfScope = await refuseIfOutOfScope(user, goal.userId);
  if (outOfScope) return outOfScope;

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
  const outOfScope = await refuseIfOutOfScope(user, goal.userId);
  if (outOfScope) return outOfScope;

  await withAudit(
    (tx) => tx.pedagogicalGoal.delete({ where: { id: goalId } }),
    { action: "PEDAGO_GOAL_UPDATED", userId: user.id, metadata: { goalId, deleted: true } },
  );
  revalidatePath(`/membres/${goal.userId}/progression`);
  return { error: null };
}

// ── US-S07 — note de suivi (sensible) ───────────────────────────────────────

export async function addNote(jeuneId: string, content: string): Promise<ActionResult> {
  const scope = await requirePedagoScope(jeuneId);
  if (!scope.ok) return scope.result;
  const { user } = scope;
  const trimmed = content.trim();
  if (!trimmed) return { error: "Note vide." };

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
  const outOfScope = await refuseIfOutOfScope(user, note.userId);
  if (outOfScope) return outOfScope;

  await withAudit(
    (tx) => tx.pedagogicalNote.delete({ where: { id: noteId } }),
    { action: "PEDAGO_NOTE_DELETED", userId: user.id, metadata: { noteId, jeuneId: note.userId } },
  );
  revalidatePath(`/membres/${note.userId}/progression`);
  return { error: null };
}
