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

// Wizard step 2: creates N loans (one per equipmentId) with the same details.
export const createLoanSchema = z.object({
  equipmentIds: z
    .array(z.string().min(1))
    .min(1, "Sélectionne au moins un article."),
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
  notes: optionalString,
});
export type ReturnLoanInput = z.infer<typeof returnLoanSchema>;

export const dryingSchema = z.object({
  dryingLocation: z.string().trim().min(1, "Indique l'endroit du séchage."),
  dryingPersonName: optionalString,
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
