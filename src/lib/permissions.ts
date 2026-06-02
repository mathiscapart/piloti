// Matrice de permissions Piloti — source unique.
// Chaque Server Action / page guard appelle `can(user, action)` avant d'exécuter
// une opération sensible.

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
] as const;
export type Action = (typeof ACTIONS)[number];

interface AuthCtx {
  role: Role | string;
  status: AccountStatus | string;
}

const ADMIN_ONLY = new Set<Action>([
  "equipment.archive",
  "incident.resolve",
  "admin.access",
  "user.approve",
  "donation.review",
]);

// US-25 — proposer un don est ouvert à tout utilisateur actif (chef, parent…).
const ANY_ACTIVE = new Set<Action>(["donation.create"]);

// `loan.return.validate` is ADMIN_OR_CHEF for now. The original spec intended
// ADMIN-only with a Chef-initiates/Admin-validates workflow — deferred to V1.5.
const ADMIN_OR_CHEF = new Set<Action>([
  "equipment.view",
  "equipment.create",
  "equipment.update",
  "loan.create",
  "loan.return.validate",
  "incident.report",
  "equipment.status.change",
  // US-14 — consulter la fiche d'un membre et le matériel qu'il détient.
  "member.view",
]);

export function can(user: AuthCtx, action: Action): boolean {
  if (user.status !== "ACTIVE") return false;
  if (ANY_ACTIVE.has(action)) return true;
  if (ADMIN_ONLY.has(action)) return user.role === "ADMIN";
  if (ADMIN_OR_CHEF.has(action)) {
    return user.role === "ADMIN" || user.role === "CHEF";
  }
  return false;
}
