import "server-only";

import { db } from "@/lib/db";
import { UNITS } from "@/lib/enums";

// Résolveur d'audience d'unité — brique transversale des « fixations logiques ».
// Pour une unité (ou le groupe), renvoie les destinataires pertinents ET le
// salon associé, afin que les événements / prêts / tâches puissent notifier et
// poster au bon endroit. Le lien parent↔jeune (FamilyLink, US-36) est le
// connecteur qui permet d'inclure les parents des jeunes d'une branche.

function hasRole(rolesJson: string, role: string): boolean {
  try {
    return (JSON.parse(rolesJson) as string[]).includes(role);
  } catch {
    return false;
  }
}

export interface UnitAudience {
  unit: string | null; // null = tout le groupe
  // Membres de l'unité (jeunes + encadrants rattachés à la branche).
  memberIds: string[];
  youthIds: string[];
  // Parents rattachés (FamilyLink) aux jeunes de l'unité.
  parentIds: string[];
  // Tous les destinataires pertinents, dédupliqués (membres + parents).
  allIds: string[];
  // #128 — chefs actifs qui ENCADRENT l'unité (`UnitLead`), membres ou non.
  // Hors de `allIds` : chaque appelant décide s'ils sont concernés.
  leaderIds: string[];
  // Salon de l'unité (convention accessUnits == [unit]) ; #general pour le groupe.
  channelId: string | null;
}

export async function resolveUnitAudience(
  unit: string | null,
): Promise<UnitAudience> {
  const isGroup = !unit || !(UNITS as readonly string[]).includes(unit);

  // Membres : tous les comptes actifs de l'unité (ou du groupe). Inclut les
  // jeunes ET les encadrants dont la branche est cette unité.
  const members = await db.user.findMany({
    where: { status: "ACTIVE", ...(isGroup ? {} : { unit }) },
    select: { id: true, roles: true },
  });
  const memberIds = members.map((m) => m.id);
  const youthIds = members
    .filter((m) => hasRole(m.roles, "SCOUT"))
    .map((m) => m.id);

  // Parents rattachés à ces jeunes (US-36).
  const links = youthIds.length
    ? await db.familyLink.findMany({
        where: { childId: { in: youthIds } },
        select: { parentId: true },
      })
    : [];
  const parentIds = [...new Set(links.map((l) => l.parentId))];

  const leads = isGroup
    ? []
    : await db.unitLead.findMany({
        where: { unit, user: { status: "ACTIVE" } },
        select: { user: { select: { id: true, roles: true } } },
      });
  const leaderIds = leads
    .filter((l) => hasRole(l.user.roles, "CHEF"))
    .map((l) => l.user.id);

  // Salon : convention accessUnits == [unit] ; #general pour le groupe.
  let channelId: string | null = null;
  const channel = isGroup
    ? await db.channel.findFirst({
        where: { archived: false, slug: "general" },
        select: { id: true },
      })
    : await db.channel.findFirst({
        where: { archived: false, accessUnits: JSON.stringify([unit]) },
        select: { id: true },
      });
  channelId = channel?.id ?? null;

  const allIds = [...new Set([...memberIds, ...parentIds])];
  return {
    unit: isGroup ? null : unit,
    memberIds,
    youthIds,
    parentIds,
    allIds,
    leaderIds,
    channelId,
  };
}
