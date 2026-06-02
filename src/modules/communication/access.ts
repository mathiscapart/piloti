import { effectiveRoles } from "@/lib/permissions";

// US-C09 — contrôle d'accès aux salons par rôle (US-29) et/ou unité.
// Règles : ADMIN voit tout. Si l'unité est dans excludeUnits → refusé.
// Salon « ouvert » (accessRoles ET accessUnits vides) → tous les ACTIVE.
// Sinon autorisé si rôle ∈ accessRoles OU unité ∈ accessUnits.

interface ChannelAccess {
  accessRoles: string;
  accessUnits: string;
  excludeUnits: string;
  archived?: boolean;
}

interface AccessUser {
  role: string;
  roles?: string[] | string | null;
  unit?: string | null;
  status?: string;
}

function parseList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

export function canAccessChannel(
  user: AccessUser,
  channel: ChannelAccess,
): boolean {
  const roles = effectiveRoles(user);
  if (roles.includes("ADMIN")) return true;

  if (user.unit && parseList(channel.excludeUnits).includes(user.unit)) {
    return false;
  }

  const accessRoles = parseList(channel.accessRoles);
  const accessUnits = parseList(channel.accessUnits);
  if (accessRoles.length === 0 && accessUnits.length === 0) return true; // ouvert
  if (roles.some((r) => accessRoles.includes(r))) return true;
  if (user.unit && accessUnits.includes(user.unit)) return true;
  return false;
}

// Écriture : pouvoir accéder + salon non archivé. ADMIN toujours.
export function canWriteChannel(
  user: AccessUser,
  channel: ChannelAccess,
): boolean {
  if (effectiveRoles(user).includes("ADMIN")) return true;
  return canAccessChannel(user, channel) && !channel.archived;
}
