"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { UNITS } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, canActOnUnit } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

// US-S01/S02 — gestion des référentiels (chef admin : pedago.referential).

const VALID_UNITS = new Set<string>(UNITS);

// Périmètre d'unité (D-024) : les ÉTAPES sont rattachées à une branche
// (`ProgressionStep.unit`), un chef ne gouverne donc que le référentiel de la
// sienne. L'archivage était le plus sensible : `listSteps` filtre sur
// `archived: false`, une étape archivée disparaît de la progression affichée
// aux jeunes de la branche et laisse les validations déjà posées orphelines.
// Les BADGES échappent volontairement à cette règle : `Badge.unitsJson` est
// multi-branches par conception (`[]` = toutes), le catalogue est transverse.
const HORS_BRANCHE_ETAPE = "Cette étape appartient à une autre branche.";

async function refuseIfStepOutOfScope(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  stepId: string,
): Promise<ActionResult | null> {
  const step = await db.progressionStep.findUnique({
    where: { id: stepId },
    select: { unit: true },
  });
  if (!step) return { error: "Étape introuvable." };
  return canActOnUnit(user, "pedago.referential", step.unit)
    ? null
    : { error: HORS_BRANCHE_ETAPE };
}

// ── Étapes de progression (US-S01) ──────────────────────────────────────────

export async function createStep(
  unit: string,
  name: string,
  description: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) return { error: "Permission refusée." };
  if (!VALID_UNITS.has(unit)) return { error: "Branche invalide." };
  if (!canActOnUnit(user, "pedago.referential", unit)) {
    return { error: "Tu ne peux créer une étape que pour ta branche." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom requis." };

  const count = await db.progressionStep.count({ where: { unit, archived: false } });
  await withAudit(
    (tx) =>
      tx.progressionStep.create({
        data: {
          unit,
          name: trimmed,
          description: description.trim() || null,
          order: count,
        },
      }),
    (s) => ({ action: "STEP_CREATED", userId: user.id, metadata: { stepId: s.id, unit } }),
  );
  revalidatePath("/pedagogie/referentiel");
  return { error: null };
}

export async function updateStep(
  stepId: string,
  name: string,
  description: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) return { error: "Permission refusée." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom requis." };

  const outOfScope = await refuseIfStepOutOfScope(user, stepId);
  if (outOfScope) return outOfScope;

  await withAudit(
    (tx) =>
      tx.progressionStep.update({
        where: { id: stepId },
        data: { name: trimmed, description: description.trim() || null },
      }),
    { action: "STEP_UPDATED", userId: user.id, metadata: { stepId } },
  );
  revalidatePath("/pedagogie/referentiel");
  return { error: null };
}

export async function moveStep(stepId: string, dir: "up" | "down"): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) return { error: "Permission refusée." };

  const step = await db.progressionStep.findUnique({ where: { id: stepId } });
  if (!step) return { error: "Étape introuvable." };
  if (!canActOnUnit(user, "pedago.referential", step.unit)) {
    return { error: HORS_BRANCHE_ETAPE };
  }

  const siblings = await db.progressionStep.findMany({
    where: { unit: step.unit, archived: false },
    orderBy: { order: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === stepId);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return { error: null };

  const a = siblings[idx];
  const b = siblings[swapWith];
  await withAudit(
    async (tx) => {
      await tx.progressionStep.update({ where: { id: a.id }, data: { order: b.order } });
      await tx.progressionStep.update({ where: { id: b.id }, data: { order: a.order } });
      return null;
    },
    { action: "STEP_UPDATED", userId: user.id, metadata: { stepId, dir } },
  );
  revalidatePath("/pedagogie/referentiel");
  return { error: null };
}

export async function archiveStep(stepId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) return { error: "Permission refusée." };
  const outOfScope = await refuseIfStepOutOfScope(user, stepId);
  if (outOfScope) return outOfScope;

  await withAudit(
    (tx) => tx.progressionStep.update({ where: { id: stepId }, data: { archived: true } }),
    { action: "STEP_ARCHIVED", userId: user.id, metadata: { stepId } },
  );
  revalidatePath("/pedagogie/referentiel");
  return { error: null };
}

// ── Catalogue de badges (US-S02) ─────────────────────────────────────────────

export async function createBadge(
  name: string,
  icon: string,
  criteria: string,
  units: string[],
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) return { error: "Permission refusée." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom requis." };
  const cleanUnits = units.filter((u) => VALID_UNITS.has(u));

  await withAudit(
    (tx) =>
      tx.badge.create({
        data: {
          name: trimmed,
          icon: icon.trim() || null,
          criteria: criteria.trim() || null,
          unitsJson: JSON.stringify(cleanUnits),
        },
      }),
    (b) => ({ action: "BADGE_CREATED", userId: user.id, metadata: { badgeId: b.id } }),
  );
  revalidatePath("/pedagogie/referentiel");
  return { error: null };
}

export async function updateBadge(
  badgeId: string,
  name: string,
  icon: string,
  criteria: string,
  units: string[],
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) return { error: "Permission refusée." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom requis." };
  const badge = await db.badge.findUnique({ where: { id: badgeId }, select: { id: true } });
  if (!badge) return { error: "Badge introuvable." };
  const cleanUnits = units.filter((u) => VALID_UNITS.has(u));

  await withAudit(
    (tx) =>
      tx.badge.update({
        where: { id: badgeId },
        data: {
          name: trimmed,
          icon: icon.trim() || null,
          criteria: criteria.trim() || null,
          unitsJson: JSON.stringify(cleanUnits),
        },
      }),
    { action: "BADGE_UPDATED", userId: user.id, metadata: { badgeId } },
  );
  revalidatePath("/pedagogie/referentiel");
  return { error: null };
}

export async function archiveBadge(badgeId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) return { error: "Permission refusée." };
  const badge = await db.badge.findUnique({ where: { id: badgeId }, select: { id: true } });
  if (!badge) return { error: "Badge introuvable." };

  await withAudit(
    (tx) => tx.badge.update({ where: { id: badgeId }, data: { archived: true } }),
    { action: "BADGE_ARCHIVED", userId: user.id, metadata: { badgeId } },
  );
  revalidatePath("/pedagogie/referentiel");
  return { error: null };
}
