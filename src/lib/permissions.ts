// Matrice de permissions Piloti — source unique.
// Chaque Server Action / page guard appelle `can(user, action)` avant d'exécuter
// une opération sensible.
//
// US-29 — moteur par rôle, multi-rôles : un compte a un rôle principal
// (User.role) + des rôles additionnels (User.roles, JSON). `can()` évalue
// l'UNION des rôles (le rôle le plus permissif l'emporte). ADMIN est
// superutilisateur (toutes les actions).
//
// US-32 — redéfinition de la matrice pour tous les rôles :
//   ADMIN, RESPONSABLE_GROUPE (RG, lecture seule sur tout), CHEF,
//   RESPONSABLE_MATERIEL, TRESORIER, SECRETAIRE, MEMBRE_LOCAL, PARENT, SCOUT.
//   Les actions de LECTURE sont distinctes des actions de MUTATION
//   (`*.view` vs `*.create/...`) afin de permettre le « lecture seule » du RG.
//   Permission conditionnée par la branche : un JEUNE (SCOUT) des branches
//   Pionniers/Compagnons peut créer un prêt.

import type { AccountStatus, Role } from "@/lib/enums";

export const ACTIONS = [
  // Inventaire
  "equipment.view",
  "equipment.create",
  "equipment.update",
  "equipment.archive",
  "equipment.status.change",
  "category.manage",
  // Prêts
  "loan.view",
  "loan.create",
  "loan.return.validate",
  // Incidents
  "incident.view",
  "incident.report",
  "incident.resolve",
  // Comptes / membres
  "admin.access",
  "audit.view", // journal d'audit en lecture (ADMIN + RG, lecture seule)
  "user.approve", // valider/refuser les inscriptions (+ attribuer les rôles)
  "user.manage", // gérer les comptes existants : rôles (page /admin/utilisateurs)
  "member.view",
  "member.directory", // US-26 — annuaire des compétences parents (RG)
  // Dons
  "donation.create",
  "donation.review",
] as const;
export type Action = (typeof ACTIONS)[number];

interface AuthCtx {
  role: Role | string;
  // Rôles additionnels : tableau, ou chaîne JSON (telle que stockée en base).
  roles?: string[] | string | null;
  // Branche/unité — nécessaire pour les permissions conditionnées (ex. JEUNE).
  unit?: string | null;
  // Optionnel : `effectiveRoles`/`hasRole` n'en ont pas besoin ; `can()` exige
  // ACTIVE (un status absent → non autorisé).
  status?: AccountStatus | string;
}

// Ouvert à tout utilisateur ACTIVE, quel que soit le rôle.
const ANY_ACTIVE = new Set<Action>(["donation.create"]);

// Pour chaque action, les rôles (hors ADMIN, superutilisateur) qui l'autorisent.
// Une action absente / à liste vide = réservée à l'ADMIN.
// RG = lecture seule : présent sur les `*.view` / `member.directory`, absent
// de toute mutation.
const CHEF = "CHEF";
const RG = "RESPONSABLE_GROUPE";
const MAT = "RESPONSABLE_MATERIEL";
const TRES = "TRESORIER";
const SEC = "SECRETAIRE";

const PERMISSIONS: Record<Action, Role[]> = {
  // Inventaire — lecture : encadrants + RG (lecture) + responsable matériel.
  "equipment.view": [CHEF, RG, MAT],
  "equipment.create": [CHEF, MAT],
  "equipment.update": [CHEF, MAT],
  "equipment.archive": [CHEF, MAT],
  "equipment.status.change": [CHEF, MAT],
  "category.manage": [CHEF, MAT],
  // Prêts — TRESORIER voit les prêts ; RG en lecture ; CHEF/MAT gèrent.
  "loan.view": [CHEF, RG, MAT, TRES],
  "loan.create": [CHEF, MAT], // + JEUNE Pios/Compas (conditionné, cf. can())
  "loan.return.validate": [CHEF, MAT],
  // Incidents — PARENT peut créer ; MAT crée et résout ; RG lit.
  "incident.view": [CHEF, RG, MAT],
  "incident.report": [CHEF, MAT, "PARENT"],
  "incident.resolve": [MAT],
  // Comptes / membres
  "admin.access": [], // ADMIN only (zone technique)
  // US-32 — RG = « lecture seule sur tout » : accès au journal d'audit en lecture.
  "audit.view": [RG],
  // US-32 — la SECRÉTAIRE valide les inscriptions et attribue les rôles
  // (sauf ADMIN/RG : garde-fou anti-élévation, cf. canAssignRole).
  "user.approve": [SEC],
  "user.manage": [SEC],
  "member.view": [CHEF, RG, SEC, TRES],
  // Annuaire des compétences : RG + SECRÉTAIRE (US-32) ; ADMIN superuser.
  "member.directory": [RG, SEC],
  // Dons — MAT accepte/refuse (page sous /admin : accès différé) ; ADMIN.
  "donation.create": [], // géré par ANY_ACTIVE
  "donation.review": [MAT],
};

/**
 * Rôles effectifs de l'utilisateur. Modèle unifié (US-32) : un compte porte un
 * SEUL ensemble de rôles dans `roles` (JSON), n'importe quelle combinaison
 * (ex. juste ["TRESORIER"]). Le champ `role` n'est plus qu'un miroir d'affichage.
 */
export function effectiveRoles(user: AuthCtx): string[] {
  if (Array.isArray(user.roles)) return user.roles.map(String);
  if (typeof user.roles === "string" && user.roles.trim() !== "") {
    try {
      const parsed = JSON.parse(user.roles);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

export function can(user: AuthCtx, action: Action): boolean {
  if (user.status !== "ACTIVE") return false;

  const roles = effectiveRoles(user);
  // ADMIN = superutilisateur.
  if (roles.includes("ADMIN")) return true;
  if (ANY_ACTIVE.has(action)) return true;

  // US-32 — permission conditionnée par la branche : un JEUNE (SCOUT) des
  // branches Pionniers / Compagnons peut créer un prêt.
  if (
    action === "loan.create" &&
    roles.includes("SCOUT") &&
    (user.unit === "PIOS" || user.unit === "COMPAS")
  ) {
    return true;
  }

  const allowed = PERMISSIONS[action] ?? [];
  return roles.some((r) => (allowed as string[]).includes(r));
}

/** Pratique pour l'UI : l'utilisateur possède-t-il ce rôle (principal ou additionnel) ? */
export function hasRole(user: AuthCtx, role: Role): boolean {
  return effectiveRoles(user).includes(role);
}

// US-32 — la zone /admin n'est plus 100 % ADMIN : différentes rubriques sont
// ouvertes à la SECRÉTAIRE (inscriptions, comptes), au RESPONSABLE_MATERIEL
// (catégories, dons) et au CHEF (catégories). L'accès à la zone est accordé
// dès qu'au moins une rubrique est accessible ; chaque page se reprotège.
const ADMIN_ZONE_ACTIONS: Action[] = [
  "admin.access",
  "audit.view",
  "user.approve",
  "user.manage",
  "category.manage",
  "donation.review",
];

export function canAccessAdminZone(user: AuthCtx): boolean {
  return ADMIN_ZONE_ACTIONS.some((a) => can(user, a));
}

// US-32 — garde-fou anti-élévation de privilèges : seul l'ADMIN peut attribuer
// les rôles sensibles (ADMIN, RESPONSABLE_GROUPE). La SECRÉTAIRE attribue tous
// les autres rôles.
const PRIVILEGED_ROLES = new Set<string>(["ADMIN", "RESPONSABLE_GROUPE"]);

export function canAssignRole(actor: AuthCtx, role: string): boolean {
  if (can(actor, "admin.access")) return true; // ADMIN attribue tout
  return !PRIVILEGED_ROLES.has(role);
}

/** Liste des rôles que `actor` est autorisé à attribuer (pour filtrer l'UI). */
export function assignableRoles(actor: AuthCtx, catalog: readonly string[]): string[] {
  return catalog.filter((r) => canAssignRole(actor, r));
}
