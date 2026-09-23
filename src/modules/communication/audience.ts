import { UNITS } from "@/lib/enums";
import { canActOnUnit, effectiveRoles } from "@/lib/permissions";

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

/**
 * #112 — périmètre de publication (D-024) : un chef publie vers SA branche ;
 * « Tout le groupe » et « Tous les parents » n'ont pas de branche et restent
 * aux rôles non bornés (RG, ADMIN). La diffusion urgente suit la même règle.
 */
export function canPublishAnnouncementTo(
  user: Parameters<typeof canActOnUnit>[0],
  audience: string,
): boolean {
  const unit = (UNITS as readonly string[]).includes(audience) ? audience : null;
  return canActOnUnit(user, "announcement.publish", unit);
}
