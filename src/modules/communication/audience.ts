import { effectiveRoles } from "@/lib/permissions";

// US-C01/C03 — audience d'une annonce : source unique des destinataires
// (notifications, relance), de la visibilité et du taux de lecture (#111).

export interface AudienceUser {
  id: string;
  role: string;
  roles: string[] | string | null;
  unit: string | null;
}

// Rattachement parent ↔ jeune (FamilyLink, US-36).
export interface FamilyEdge {
  parentId: string;
  childId: string;
}

// Ids de l'audience parmi une liste d'utilisateurs ACTIFS, en excluant
// éventuellement l'auteur. Pour une branche : ses membres (jeunes +
// encadrement) et les parents rattachés à ses jeunes.
export function audienceUserIds(
  users: AudienceUser[],
  links: FamilyEdge[],
  audience: string,
  excludeUserId?: string,
): string[] {
  const ids = new Set<string>();
  if (audience === "ALL") {
    for (const u of users) ids.add(u.id);
  } else if (audience === "PARENTS") {
    for (const u of users) if (effectiveRoles(u).includes("PARENT")) ids.add(u.id);
  } else {
    const youthIds = new Set<string>();
    for (const u of users) {
      if (u.unit !== audience) continue;
      ids.add(u.id);
      if (effectiveRoles(u).includes("SCOUT")) youthIds.add(u.id);
    }
    const activeIds = new Set(users.map((u) => u.id));
    for (const l of links) {
      if (youthIds.has(l.childId) && activeIds.has(l.parentId)) ids.add(l.parentId);
    }
  }
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}
