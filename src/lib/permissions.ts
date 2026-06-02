// Matrice de permissions Piloti — source unique.
// Chaque Server Action / page guard appelle `can(user, action)` avant d'exécuter
// une opération sensible.
//
// US-29 — moteur par rôle, multi-rôles : un compte a un rôle principal
// (User.role) + des rôles additionnels (User.roles, JSON). `can()` évalue
// l'UNION des rôles. ADMIN est superutilisateur (toutes les actions).

import type { AccountStatus, Role } from "@/lib/enums";

export const ACTIONS = [
  "equipment.view",
  "equipment.create",
  "equipment.update",
  "equipment.archive",
  "loan.create",
  "loan.return.validate",
  "incident.report",
  "incident.resolve",
  "equipment.status.change",
  "admin.access",
  "user.approve",
  "donation.create",
  "donation.review",
  "member.view",
  // US-26 — annuaire des compétences parents, réservé aux responsables de groupe.
  "member.directory",
] as const;
export type Action = (typeof ACTIONS)[number];

interface AuthCtx {
  role: Role | string;
  // Rôles additionnels : tableau, ou chaîne JSON (telle que stockée en base).
  roles?: string[] | string | null;
  // Optionnel : `effectiveRoles`/`hasRole` n'en ont pas besoin ; `can()` exige
  // ACTIVE (un status absent → non autorisé).
  status?: AccountStatus | string;
}

// Ouvert à tout utilisateur ACTIVE, quel que soit le rôle.
const ANY_ACTIVE = new Set<Action>(["donation.create"]);

// Pour chaque action, les rôles (hors ADMIN, superutilisateur) qui l'autorisent.
// Une action absente / à liste vide = réservée à l'ADMIN.
const PERMISSIONS: Record<Action, Role[]> = {
  "equipment.view": ["CHEF"],
  "equipment.create": ["CHEF"],
  "equipment.update": ["CHEF"],
  "equipment.archive": [], // ADMIN only
  "loan.create": ["CHEF"],
  "loan.return.validate": ["CHEF"],
  "incident.report": ["CHEF"],
  "incident.resolve": [], // ADMIN only
  "equipment.status.change": ["CHEF"],
  "admin.access": [], // ADMIN only
  "user.approve": [], // ADMIN only
  "donation.create": [], // géré par ANY_ACTIVE
  "donation.review": [], // ADMIN only
  "member.view": ["CHEF"],
  "member.directory": ["RESPONSABLE_GROUPE"],
};

/** Union du rôle principal et des rôles additionnels (parse JSON si besoin). */
export function effectiveRoles(user: AuthCtx): string[] {
  let extra: string[] = [];
  if (Array.isArray(user.roles)) {
    extra = user.roles;
  } else if (typeof user.roles === "string" && user.roles.trim() !== "") {
    try {
      const parsed = JSON.parse(user.roles);
      if (Array.isArray(parsed)) extra = parsed.map(String);
    } catch {
      extra = [];
    }
  }
  return [user.role, ...extra];
}

export function can(user: AuthCtx, action: Action): boolean {
  if (user.status !== "ACTIVE") return false;

  const roles = effectiveRoles(user);
  // ADMIN = superutilisateur.
  if (roles.includes("ADMIN")) return true;
  if (ANY_ACTIVE.has(action)) return true;

  const allowed = PERMISSIONS[action] ?? [];
  return roles.some((r) => (allowed as string[]).includes(r));
}

/** Pratique pour l'UI : l'utilisateur possède-t-il ce rôle (principal ou additionnel) ? */
export function hasRole(user: AuthCtx, role: Role): boolean {
  return effectiveRoles(user).includes(role);
}
