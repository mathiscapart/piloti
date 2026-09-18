import { UNITS } from "@/lib/enums";
import { canActOnUnit, effectiveRoles } from "@/lib/permissions";

// US-C01/C03 — logique d'audience d'une annonce, partagée entre la résolution
// des destinataires (notifications, relance) et le calcul du taux de lecture.

export interface AudienceUser {
  id: string;
  role: string;
  roles: string[] | string | null;
  unit: string | null;
}

export function audienceMatches(user: AudienceUser, audience: string): boolean {
  if (audience === "ALL") return true;
  if (audience === "PARENTS") return effectiveRoles(user).includes("PARENT");
  return user.unit === audience; // une branche précise
}

// Destinataires (ids) d'une annonce parmi une liste d'utilisateurs ACTIFS,
// en excluant éventuellement l'auteur.
export function audienceUserIds(
  users: AudienceUser[],
  audience: string,
  excludeUserId?: string,
): string[] {
  return users
    .filter((u) => u.id !== excludeUserId && audienceMatches(u, audience))
    .map((u) => u.id);
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
