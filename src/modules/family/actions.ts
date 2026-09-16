"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, canActOnUnit, effectiveRoles } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

// Rattachement familial — géré par les chefs, le responsable de groupe, la
// secrétaire et l'ADMIN (`member.family.manage`). Crée/supprime un lien
// parent→jeune, tracé dans l'AuditLog.
//
// Périmètre d'unité (D-024, #83) : le lien ouvre des droits sur un mineur
// (progression, inscriptions, messagerie privée). Un CHEF n'agit que sur les
// jeunes de SA branche ; la limite porte sur l'unité du JEUNE de chaque lien.
// Secrétaire, RG et ADMIN, rôles transverses, ne sont pas bornés.

const HORS_BRANCHE = "Ce jeune est dans une autre branche que la tienne.";

export async function linkFamily(
  parentId: string,
  childId: string,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "member.family.manage")) {
    return { error: "Réservé aux chefs et à l'administration." };
  }
  if (parentId === childId) {
    return { error: "Un compte ne peut pas être son propre parent." };
  }
  // SAFE-01 : un encadrant ne se déclare pas parent d'un jeune — le lien lui
  // ouvrirait la messagerie privée avec l'enfant.
  if (parentId === actor.id) {
    return { error: "Tu ne peux pas te rattacher toi-même à un jeune." };
  }

  const [parent, child] = await Promise.all([
    db.user.findUnique({ where: { id: parentId }, select: { roles: true, status: true } }),
    db.user.findUnique({ where: { id: childId }, select: { roles: true, unit: true, status: true } }),
  ]);
  if (!parent || !child) return { error: "Compte introuvable." };
  // Le sélecteur ne propose que des PARENT et des SCOUT actifs, mais le serveur
  // ne fait pas confiance à l'identifiant reçu.
  if (parent.status !== "ACTIVE" || !effectiveRoles(parent).includes("PARENT")) {
    return { error: "Seul un compte parent actif peut être rattaché à un jeune." };
  }
  if (child.status !== "ACTIVE" || !effectiveRoles(child).includes("SCOUT")) {
    return { error: "Seul un jeune actif peut être rattaché à un parent." };
  }
  if (!canActOnUnit(actor, "member.family.manage", child.unit)) {
    return { error: HORS_BRANCHE };
  }

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
  if (!can(actor, "member.family.manage")) {
    return { error: "Réservé aux chefs et à l'administration." };
  }

  const link = await db.familyLink.findUnique({
    where: { parentId_childId: { parentId, childId } },
    select: { id: true, child: { select: { unit: true } } },
  });
  if (!link) return { error: "Rattachement introuvable." };
  if (!canActOnUnit(actor, "member.family.manage", link.child.unit)) {
    return { error: HORS_BRANCHE };
  }

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
