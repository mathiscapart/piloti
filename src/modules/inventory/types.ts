import { z } from "zod";

import { EQUIPMENT_CONDITIONS, INCIDENT_SEVERITIES } from "@/lib/enums";

// Reusable optional string transform: trims whitespace and converts empty strings to undefined.
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// ----------------------------------------------------------------------------
// Equipment
// ----------------------------------------------------------------------------

export const equipmentInputSchema = z.object({
  name: z.string().trim().min(1, "Nom requis."),
  // US-31 — « Autre » est le réceptacle par défaut : un article sans catégorie
  // choisie y est rattaché plutôt que d'être rejeté.
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "AUTRE")),
  totalQty: z.coerce.number().int().min(1, "Quantité minimum 1."),
  condition: z.enum(EQUIPMENT_CONDITIONS).default("BON"),
  location: optionalString,
  photo: z
    .union([z.string().url("URL de photo invalide."), z.literal("")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  notes: optionalString,
  // US-17 — poids de référence (catégorie pesable). Validé contre la catégorie
  // dans l'action (obligatoire si la catégorie est pesable).
  baseWeightKg: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().positive("Poids de base invalide.").optional(),
  ),
});

export type EquipmentInput = z.infer<typeof equipmentInputSchema>;

export const CONDITION_LABEL: Record<(typeof EQUIPMENT_CONDITIONS)[number], string> = {
  NEUF: "Neuf",
  BON: "Bon état",
  USE: "Usé",
  A_REPARER: "À réparer",
  HORS_SERVICE: "Hors service",
};

// ----------------------------------------------------------------------------
// Loans
// ----------------------------------------------------------------------------

// US-30 — chaque article emprunté porte une quantité (≥ 1).
export const loanItemSchema = z.object({
  equipmentId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Quantité minimum 1."),
  // US-32 — date de retour par article (défaut = date commune du prêt).
  expectedReturn: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.date().optional(),
  ),
});
export type LoanItemInput = z.infer<typeof loanItemSchema>;

// US-32 — wizard : crée UN prêt groupé (groupId partagé) avec une ligne par
// article. startDate + expectedReturn sont la période commune ; chaque article
// peut surcharger sa propre date de retour.
export const createLoanSchema = z.object({
  items: z.array(loanItemSchema).min(1, "Sélectionne au moins un article."),
  borrowerId: z.string().min(1, "Choisis un emprunteur."),
  startDate: z.coerce.date(),
  expectedReturn: z.coerce.date(),
  eventName: optionalString,
  notes: optionalString,
});
export type CreateLoanInput = z.infer<typeof createLoanSchema>;

// Condition observed at return. ABIME redirects to the incident form.
export const RETURN_CONDITIONS = ["BON", "ABIME", "A_REPARER"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const RETURN_CONDITION_LABEL: Record<ReturnCondition, string> = {
  BON: "Bon état",
  ABIME: "Abîmé",
  A_REPARER: "À réparer",
};

export const returnLoanSchema = z.object({
  condition: z.enum(RETURN_CONDITIONS),
  // US-30 — quantité rendue (retours partiels / pertes). Absent = tout rendre.
  returnedQuantity: z.coerce.number().int().min(1).optional(),
  // US-17/US-18 — poids relevé au retour (kg), exigé si la catégorie l'impose.
  returnWeightKg: z.coerce.number().positive("Poids invalide.").optional(),
  notes: optionalString,
});
export type ReturnLoanInput = z.infer<typeof returnLoanSchema>;

export const dryingSchema = z.object({
  dryingLocation: z.string().trim().min(1, "Indique l'endroit du séchage."),
  // US-23 — contact référent rattaché à un compte (id User), optionnel.
  dryingContactId: optionalString,
});
export type DryingInput = z.infer<typeof dryingSchema>;

// ----------------------------------------------------------------------------
// Incidents
// ----------------------------------------------------------------------------

export const createIncidentSchema = z.object({
  equipmentId: z.string().min(1, "Choisis un article."),
  types: z
    .array(z.string().min(1))
    .min(1, "Coche au moins un type de problème."),
  severity: z.enum(INCIDENT_SEVERITIES),
  notes: optionalString,
  photos: z.array(z.string()).optional().default([]),
  loanId: optionalString,
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const resolveIncidentSchema = z.object({
  resolvedNote: optionalString,
});
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;

export const SEVERITY_LABEL: Record<(typeof INCIDENT_SEVERITIES)[number], string> = {
  BLOQUANT: "Bloquant",
  GENANT: "Gênant",
  MINEUR: "Mineur",
};

export const SEVERITY_DESCRIPTION: Record<(typeof INCIDENT_SEVERITIES)[number], string> = {
  BLOQUANT: "Ne peut pas être utilisé",
  GENANT: "Utilisable avec précaution",
  MINEUR: "À surveiller",
};

// ----------------------------------------------------------------------------
// Donations (US-25)
// ----------------------------------------------------------------------------

export const createDonationSchema = z.object({
  category: z.string().trim().min(1, "Catégorie requise."),
  name: z.string().trim().min(1, "Nom de l'article requis."),
  quantity: z.coerce.number().int().min(1, "Quantité minimum 1."),
  condition: z.enum(EQUIPMENT_CONDITIONS).default("BON"),
  dropoffDate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.date().optional(),
  ),
  donorName: optionalString,
  note: optionalString,
});
export type CreateDonationInput = z.infer<typeof createDonationSchema>;

export const rejectDonationSchema = z.object({
  rejectedReason: optionalString,
});

export const DONATION_STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Validé",
  REJECTED: "Refusé",
};
