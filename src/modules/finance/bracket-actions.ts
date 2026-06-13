"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

// US-F — tranches de quotient familial. Gérées par le trésorier (campaign.manage).

// Parse un coefficient saisi en pourcentage (ex. « 60 » → 600 pour-mille).
function parsePercent(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t.length === 0) return null;
  const pct = Number(t);
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000) return null;
  return Math.round(pct * 10);
}

export async function createBracket(
  name: string,
  percentStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) return { error: "Permission refusée." };

  const trimmed = name.trim();
  if (trimmed.length === 0) return { error: "Nom requis." };
  const permille = parsePercent(percentStr);
  if (permille === null) return { error: "Coefficient invalide (en %)." };

  const count = await db.socialBracket.count({ where: { archived: false } });

  await withAudit(
    (tx) =>
      tx.socialBracket.create({
        data: { name: trimmed, coefficientPermille: permille, order: count },
      }),
    {
      action: "BRACKET_CREATED",
      userId: user.id,
      metadata: { name: trimmed, coefficientPermille: permille },
    },
  );

  revalidatePath("/finances/tranches");
  return { error: null };
}

export async function updateBracket(
  bracketId: string,
  name: string,
  percentStr: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) return { error: "Permission refusée." };

  const trimmed = name.trim();
  if (trimmed.length === 0) return { error: "Nom requis." };
  const permille = parsePercent(percentStr);
  if (permille === null) return { error: "Coefficient invalide (en %)." };

  const bracket = await db.socialBracket.findUnique({
    where: { id: bracketId },
    select: { id: true },
  });
  if (!bracket) return { error: "Tranche introuvable." };

  await withAudit(
    (tx) =>
      tx.socialBracket.update({
        where: { id: bracketId },
        data: { name: trimmed, coefficientPermille: permille },
      }),
    {
      action: "BRACKET_UPDATED",
      userId: user.id,
      metadata: { bracketId, name: trimmed, coefficientPermille: permille },
    },
  );

  revalidatePath("/finances/tranches");
  return { error: null };
}

export async function archiveBracket(bracketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) return { error: "Permission refusée." };

  const bracket = await db.socialBracket.findUnique({
    where: { id: bracketId },
    select: { id: true },
  });
  if (!bracket) return { error: "Tranche introuvable." };

  await withAudit(
    async (tx) => {
      // Détache les membres avant d'archiver (ils repassent au tarif plein).
      await tx.user.updateMany({
        where: { socialBracketId: bracketId },
        data: { socialBracketId: null },
      });
      return tx.socialBracket.update({
        where: { id: bracketId },
        data: { archived: true },
      });
    },
    { action: "BRACKET_ARCHIVED", userId: user.id, metadata: { bracketId } },
  );

  revalidatePath("/finances/tranches");
  return { error: null };
}

// Assigne (ou retire, si bracketId === "") la tranche d'un jeune.
export async function setUserBracket(
  targetUserId: string,
  bracketId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) return { error: "Permission refusée." };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) return { error: "Membre introuvable." };

  const newId = bracketId.trim().length === 0 ? null : bracketId;
  if (newId) {
    const bracket = await db.socialBracket.findFirst({
      where: { id: newId, archived: false },
      select: { id: true },
    });
    if (!bracket) return { error: "Tranche introuvable." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: targetUserId },
        data: { socialBracketId: newId },
      }),
    {
      action: "USER_BRACKET_SET",
      userId: user.id,
      metadata: { targetUserId, bracketId: newId },
    },
  );

  revalidatePath(`/membres/${targetUserId}`);
  return { error: null };
}
