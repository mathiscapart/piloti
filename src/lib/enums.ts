// Enums portés en TypeScript car SQLite ne supporte pas les enums Prisma.
// Source unique : ce fichier. Le schéma Prisma utilise des `String` ; cette
// liste sert pour Zod/validation, dropdowns UI, et types app-wide.

// US-29 — catalogue de rôles. ADMIN/CHEF/PARENT/SCOUT = rôle « principal »
// (champ User.role). Les rôles fonctionnels supplémentaires (RG, Trésorier…)
// s'ajoutent en multi-rôles via User.roles (JSON). Catalogue extensible ici.
export const ROLES = [
  "ADMIN",
  "CHEF",
  "PARENT",
  "SCOUT",
  "RESPONSABLE_GROUPE",
  "RESPONSABLE_MATERIEL",
  "TRESORIER",
  "SECRETAIRE",
  "MEMBRE_LOCAL",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrateur",
  CHEF: "Chef",
  PARENT: "Parent",
  SCOUT: "Jeune",
  RESPONSABLE_GROUPE: "Responsable de groupe",
  RESPONSABLE_MATERIEL: "Responsable matériel",
  TRESORIER: "Trésorier",
  SECRETAIRE: "Secrétaire",
  MEMBRE_LOCAL: "Membre du local",
};

// Rôles « principaux » attribuables comme User.role (compat existant).
export const PRIMARY_ROLES = ["ADMIN", "CHEF", "PARENT", "SCOUT"] as const;

// Rôles fonctionnels additionnels (« casquettes ») attribuables en plus du
// rôle principal, via User.roles. Un parent peut être aussi trésorier, etc.
export const EXTRA_ROLES = [
  "RESPONSABLE_GROUPE",
  "RESPONSABLE_MATERIEL",
  "TRESORIER",
  "SECRETAIRE",
  "MEMBRE_LOCAL",
] as const;

export const ACCOUNT_STATUSES = [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const UNITS = [
  "BLEUS",
  "VERTS",
  "ROUGES",
  "PIOS",
  "COMPAS",
  "VIOLETS",
] as const;
export type Unit = (typeof UNITS)[number];

export const EQUIPMENT_CONDITIONS = [
  "NEUF",
  "BON",
  "USE",
  "A_REPARER",
  "HORS_SERVICE",
] as const;
export type EquipmentCondition = (typeof EQUIPMENT_CONDITIONS)[number];

export const LOAN_STATUSES = [
  "ACTIF",
  "RETARD",
  "RETOURNE",
  "SECHAGE",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

// The three statuses where equipment is unavailable (not yet returned).
export const ACTIVE_LOAN_STATUSES = ["ACTIF", "RETARD", "SECHAGE"] as const;
export type ActiveLoanStatus = (typeof ACTIVE_LOAN_STATUSES)[number];

export const INCIDENT_SEVERITIES = ["BLOQUANT", "GENANT", "MINEUR"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const DONATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

export const EVENT_TYPES = ["REUNION", "WEEK_END", "CAMP", "SERVICE"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Canonical audit action names. Every withAudit() call should use one of these.
export const AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "USER_APPROVED",
  "USER_REACTIVATED",
  "USER_REJECTED",
  "USER_SUSPENDED",
  "USER_ROLE_CHANGED",
  "USER_DELETED",
  "USER_PASSWORD_CHANGED",
  "EQUIPMENT_CREATED",
  "EQUIPMENT_UPDATED",
  "EQUIPMENT_ARCHIVED",
  "EQUIPMENT_STATUS_CHANGED",
  "LOAN_CREATED",
  "LOAN_RETURNED",
  "LOAN_DRYING_STARTED",
  "INCIDENT_REPORTED",
  "INCIDENT_RESOLVED",
  "CATEGORY_CREATED",
  "CATEGORY_UPDATED",
  "CATEGORY_DELETED",
  "CATEGORY_ARCHIVED",
  "CATEGORY_RESTORED",
  "DONATION_SUBMITTED",
  "DONATION_APPROVED",
  "DONATION_REJECTED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
