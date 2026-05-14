// Enums portés en TypeScript car SQLite ne supporte pas les enums Prisma.
// Source unique : ce fichier. Le schéma Prisma utilise des `String` ; cette
// liste sert pour Zod/validation, dropdowns UI, et types app-wide.

export const ROLES = ["ADMIN", "CHEF", "PARENT", "SCOUT"] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const UNITS = ["BLEUS", "VERTS", "ROUGES", "PIOS", "COMPAS"] as const;
export type Unit = (typeof UNITS)[number];

export const EQUIPMENT_CATEGORIES = [
  "TENTE",
  "MALLE",
  "CUISINE",
  "BIVOUAC",
  "JEU",
  "AUTRE",
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

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

export const INCIDENT_SEVERITIES = ["BLOQUANT", "GENANT", "MINEUR"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const EVENT_TYPES = ["REUNION", "WEEK_END", "CAMP", "SERVICE"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Liste libre — chaque mutation choisit son action. Pas restreinte à cette
// liste pour rester extensible, mais ces valeurs sont les canoniques.
export const AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "USER_APPROVED",
  "USER_REJECTED",
  "USER_SUSPENDED",
  "USER_ROLE_CHANGED",
  "EQUIPMENT_CREATED",
  "EQUIPMENT_UPDATED",
  "EQUIPMENT_ARCHIVED",
  "EQUIPMENT_STATUS_CHANGED",
  "LOAN_CREATED",
  "LOAN_RETURNED",
  "LOAN_DRYING_STARTED",
  "INCIDENT_REPORTED",
  "INCIDENT_RESOLVED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
