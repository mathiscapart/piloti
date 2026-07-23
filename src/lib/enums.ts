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

// RGPD-02 — type de consentement à l'inscription (Consent.type). SELF = donné
// par la personne elle-même (≥ 15 ans). PARENTAL = attestation du responsable
// légal pour un mineur de moins de 15 ans (cf. src/lib/legal/versions.ts).
export const CONSENT_TYPES = ["SELF", "PARENTAL"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const ACCOUNT_STATUSES = [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

// Branches officielles SGDF (+ branche adulte « Adultes » : responsables, local).
export const UNITS = [
  "FARFADETS",
  "LOUVETEAUX",
  "SCOUTS",
  "PIONNIERS",
  "COMPAGNONS",
  "ADULTES",
] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABEL: Record<Unit, string> = {
  FARFADETS: "Farfadets (6-8 ans)",
  LOUVETEAUX: "Louveteaux-Jeannettes (8-11 ans)",
  SCOUTS: "Scouts-Guides (11-14 ans)",
  PIONNIERS: "Pionniers-Caravelles (14-17 ans)",
  COMPAGNONS: "Compagnons (17-21 ans)",
  ADULTES: "Adultes (responsables, local)",
};

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

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  REUNION: "Réunion",
  WEEK_END: "Week-end",
  CAMP: "Camp",
  SERVICE: "Service",
};

// US-P04 — réponse d'inscription à un événement.
export const RSVP_RESPONSES = ["PRESENT", "ABSENT", "MAYBE"] as const;
export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

export const RSVP_LABEL: Record<RsvpResponse, string> = {
  PRESENT: "Présent",
  ABSENT: "Absent",
  MAYBE: "Peut-être",
};

// US-F06/F07 — notes de frais.
export const EXPENSE_CATEGORIES = [
  "TRANSPORT",
  "HEBERGEMENT",
  "NOURRITURE",
  "MATERIEL",
  "ACTIVITES",
  "AUTRE",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRANSPORT: "Transport",
  HEBERGEMENT: "Hébergement",
  NOURRITURE: "Nourriture",
  MATERIEL: "Matériel",
  ACTIVITES: "Activités",
  AUTRE: "Autre",
};

// US-L04 — équipements d'un lieu de camp (cases à cocher + filtre US-L01).
export const CAMP_EQUIPMENT = [
  "WATER",
  "TOILETS",
  "SHOWERS",
  "SHELTER",
  "ELECTRICITY",
  "KITCHEN",
  "FIREWOOD",
  "PARKING",
  "WOOD",
  "RIVER",
] as const;
export type CampEquipment = (typeof CAMP_EQUIPMENT)[number];

export const CAMP_EQUIPMENT_LABEL: Record<CampEquipment, string> = {
  WATER: "Eau potable",
  TOILETS: "Sanitaires",
  SHOWERS: "Douches",
  SHELTER: "Abri / bâtiment",
  ELECTRICITY: "Électricité",
  KITCHEN: "Cuisine",
  FIREWOOD: "Feu autorisé",
  PARKING: "Parking",
  WOOD: "Bois / forêt",
  RIVER: "Point d'eau / rivière",
};

export const EXPENSE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REIMBURSED",
  "REJECTED",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REIMBURSED: "Remboursée",
  REJECTED: "Refusée",
};

export const REIMBURSEMENT_METHODS = ["ESPECES", "CHEQUE", "VIREMENT"] as const;
export type ReimbursementMethod = (typeof REIMBURSEMENT_METHODS)[number];

export const REIMBURSEMENT_METHOD_LABEL: Record<ReimbursementMethod, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
};

// Seuil (en centimes) au-dessus duquel le reçu est obligatoire (US-F06 : 20 €).
export const RECEIPT_REQUIRED_ABOVE_CENTS = 2000;

// US-F02 — modes de paiement d'une cotisation.
export const PAYMENT_METHODS = [
  "ESPECES",
  "CHEQUE",
  "VIREMENT",
  "EN_LIGNE",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  EN_LIGNE: "En ligne",
};

// US-F02 — statut de cotisation d'un jeune (dérivé : payé vs dû vs échéance).
export const PAYMENT_STATUSES = ["PAID", "PARTIAL", "PENDING", "LATE"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: "Payé",
  PARTIAL: "Partiel",
  PENDING: "En attente",
  LATE: "En retard",
};

// US-P11 — fréquence de récurrence d'une tâche.
export const RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  NONE: "Ponctuelle",
  DAILY: "Quotidienne",
  WEEKLY: "Hebdomadaire",
  MONTHLY: "Mensuelle",
  YEARLY: "Annuelle",
};

// Types de notification (cloche in-app + email + push). Extensible : chaque
// nouveau déclencheur (annonce, mention, alerte retard…) ajoute une valeur ici.
export const NOTIFICATION_TYPES = [
  "CHANNEL_MESSAGE", // nouveau(x) message(s) dans un salon accessible
  "ANNOUNCEMENT", // US-C01 — annonce publiée
  "DIRECT_MESSAGE", // US-C04 — message privé reçu
  "MENTION", // mention directe
  "LOAN_OVERDUE", // US-07 — prêt en retard
  "EVENT_REMINDER", // US-P06 — relance d'inscription avant la date limite
  "TASK_REMINDER", // US-P11 — rappel / relance d'une tâche récurrente
  "EVENT_UPDATE", // création / modification / annulation d'un événement
  "ATTENDANCE_ALERT", // US-P08 — absences consécutives (alerte aux parents)
  "EXPENSE_SUBMITTED", // US-F06 — note de frais déclarée (→ trésorier)
  "EXPENSE_UPDATE", // US-F07 — note de frais approuvée / remboursée / refusée
  "CAMPAIGN_LAUNCHED", // US-F01 — campagne de cotisation lancée (→ familles)
  "CAMPAIGN_REMINDER", // US-F03 — relance d'une cotisation en retard
  "STEP_VALIDATION_REQUEST", // US-S04 — 2e chef sollicité pour confirmer une étape
  "STEP_VALIDATED", // US-S04 — étape confirmée (→ jeune / parent)
  "BADGE_AWARDED", // US-S05 — badge attribué (→ jeune / parent)
  "REPORT_UPDATE", // SAFE-02 — signalement traité (résolu ou rejeté) → le signalant
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// SAFE-02 — signalement & modération de contenu. `targetType` est polymorphe :
// Message (salon) et DirectMessage n'ont pas de parent commun (cf. Report,
// prisma/schema.prisma).
export const REPORT_TARGET_TYPES = ["CHANNEL_MESSAGE", "DIRECT_MESSAGE"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_STATUSES = ["PENDING", "RESOLVED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  PENDING: "En attente",
  RESOLVED: "Résolu",
  DISMISSED: "Rejeté",
};

// V7 — statuts du suivi pédagogique.
export const STEP_VALIDATION_STATUSES = ["PROPOSED", "CONFIRMED"] as const;
export type StepValidationStatus = (typeof STEP_VALIDATION_STATUSES)[number];

export const GOAL_STATUSES = ["IN_PROGRESS", "ACHIEVED"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

// US-C01 — audience d'une annonce : tout le groupe, les parents, ou une branche.
// Stockée en `Announcement.audience` ("ALL" | "PARENTS" | <Unit>).
export const ANNOUNCEMENT_AUDIENCES = ["ALL", "PARENTS", ...UNITS] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_AUDIENCE_LABEL: Record<string, string> = {
  ALL: "Tout le groupe",
  PARENTS: "Les parents",
  ...UNIT_LABEL,
};

// Canonical audit action names. Every withAudit() call should use one of these.
export const AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "USER_APPROVED",
  "USER_REACTIVATED",
  "USER_REJECTED",
  "USER_SUSPENDED",
  "USER_ROLE_CHANGED",
  "USER_UNIT_CHANGED",
  "USER_PROFILE_UPDATED",
  "USER_DELETED",
  "USER_PASSWORD_CHANGED",
  "USER_FAMILY_LINKED",
  "USER_FAMILY_UNLINKED",
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
  "ANNOUNCEMENT_PUBLISHED",
  "ANNOUNCEMENT_DELETED",
  "EVENT_CREATED",
  "EVENT_UPDATED",
  "EVENT_DELETED",
  "EVENT_RSVP",
  "EVENT_ATTENDANCE",
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_DELETED",
  "TASK_SIGNUP",
  "EXPENSE_CREATED",
  "EXPENSE_APPROVED",
  "EXPENSE_REJECTED",
  "EXPENSE_REIMBURSED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_PAYMENT_RECORDED",
  "CAMPAIGN_EXEMPTION_TOGGLED",
  "BUDGET_LINE_SET",
  "EVENT_PRICE_SET",
  "EVENT_PAYMENT_RECORDED",
  "CASHBOX_CREATED",
  "CASH_MOVEMENT",
  "CASH_TRANSFER",
  "BRACKET_CREATED",
  "BRACKET_UPDATED",
  "BRACKET_ARCHIVED",
  "USER_BRACKET_SET",
  "PLACE_CREATED",
  "PLACE_UPDATED",
  "PLACE_ARCHIVED",
  "PLACE_REVIEW_ADDED",
  "EVENT_PLACE_LINKED",
  "STEP_CREATED",
  "STEP_UPDATED",
  "STEP_ARCHIVED",
  "BADGE_CREATED",
  "BADGE_UPDATED",
  "BADGE_ARCHIVED",
  "STEP_VALIDATION_PROPOSED",
  "STEP_VALIDATION_CONFIRMED",
  "STEP_VALIDATION_REMOVED",
  "BADGE_AWARD_GRANTED",
  "BADGE_AWARD_REVOKED",
  "PEDAGO_GOAL_SET",
  "PEDAGO_GOAL_UPDATED",
  "PEDAGO_NOTE_ADDED",
  "MESSAGE_REPORTED",
  "MESSAGE_HIDDEN",
  "REPORT_RESOLVED",
  "REPORT_DISMISSED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
