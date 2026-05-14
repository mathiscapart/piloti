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
] as const;
export type Action = (typeof ACTIONS)[number];

interface AuthCtx {
  role: Role | string;
  status: AccountStatus | string;
}

const ADMIN_ONLY = new Set<Action>([
  "equipment.archive",
  "loan.return.validate",
  "incident.resolve",
  "admin.access",
  "user.approve",
]);

const ADMIN_OR_CHEF = new Set<Action>([
  "equipment.view",
  "equipment.create",
  "equipment.update",
  "loan.create",
  "incident.report",
  "equipment.status.change",
]);

export function can(user: AuthCtx, action: Action): boolean {
  if (user.status !== "ACTIVE") return false;
  if (ADMIN_ONLY.has(action)) return user.role === "ADMIN";
  if (ADMIN_OR_CHEF.has(action)) {
    return user.role === "ADMIN" || user.role === "CHEF";
  }
  return false;
}
