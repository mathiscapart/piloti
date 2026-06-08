import { effectiveRoles } from "@/lib/permissions";

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
