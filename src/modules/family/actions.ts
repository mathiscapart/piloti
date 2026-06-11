"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

// Rattachement familial — géré par l'administration (user.manage). Crée/supprime
// un lien parent→jeune, tracé dans l'AuditLog.

export async function linkFamily(
  parentId: string,
  childId: string,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "user.manage")) {
    return { error: "Réservé à l'administration." };
  }
  if (parentId === childId) {
    return { error: "Un compte ne peut pas être son propre parent." };
  }

  const [parent, child] = await Promise.all([
    db.user.findUnique({ where: { id: parentId }, select: { id: true } }),
    db.user.findUnique({ where: { id: childId }, select: { id: true } }),
  ]);
  if (!parent || !child) return { error: "Compte introuvable." };

  const existing = await db.familyLink.findUnique({
    where: { parentId_childId: { parentId, childId } },
    select: { id: true },
  });
  if (existing) return { error: "Ce rattachement existe déjà." };

  await withAudit(
    (tx) => tx.familyLink.create({ data: { parentId, childId } }),
    {
      action: "USER_FAMILY_LINKED",
      userId: actor.id,
      metadata: { parentId, childId },
    },
  );

  revalidatePath(`/membres/${parentId}`);
  revalidatePath(`/membres/${childId}`);
  return { error: null };
}

export async function unlinkFamily(
  parentId: string,
  childId: string,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "user.manage")) {
    return { error: "Réservé à l'administration." };
  }

  const link = await db.familyLink.findUnique({
    where: { parentId_childId: { parentId, childId } },
    select: { id: true },
  });
  if (!link) return { error: "Rattachement introuvable." };

  await withAudit(
    (tx) => tx.familyLink.delete({ where: { id: link.id } }),
    {
      action: "USER_FAMILY_UNLINKED",
      userId: actor.id,
      metadata: { parentId, childId },
    },
  );

  revalidatePath(`/membres/${parentId}`);
  revalidatePath(`/membres/${childId}`);
  return { error: null };
}
