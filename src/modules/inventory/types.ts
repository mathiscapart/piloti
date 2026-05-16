import { z } from "zod";

import { EQUIPMENT_CATEGORIES, EQUIPMENT_CONDITIONS } from "@/lib/enums";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const equipmentInputSchema = z.object({
  name: z.string().trim().min(1, "Nom requis."),
  category: z.enum(EQUIPMENT_CATEGORIES),
  totalQty: z.coerce.number().int().min(1, "Quantité minimum 1."),
  condition: z.enum(EQUIPMENT_CONDITIONS).default("BON"),
  location: optional,
  photo: z
    .union([z.string().url("URL de photo invalide."), z.literal("")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  notes: optional,
});

export type EquipmentInput = z.infer<typeof equipmentInputSchema>;

export const CATEGORY_LABEL: Record<(typeof EQUIPMENT_CATEGORIES)[number], string> = {
  TENTE: "Tente",
  MALLE: "Malle",
  CUISINE: "Cuisine",
  BIVOUAC: "Bivouac",
  JEU: "Jeu",
  AUTRE: "Autre",
};

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

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// Step 2 du wizard : crée N prêts (un par equipmentId) avec mêmes infos.
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

// État constaté au retour. ABIME → l'app redirige vers le formulaire incident.
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

import { INCIDENT_SEVERITIES } from "@/lib/enums";

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

export const SEVERITY_DESCRIPTION: Record<
  (typeof INCIDENT_SEVERITIES)[number],
  string
> = {
  BLOQUANT: "Ne peut pas être utilisé",
  GENANT: "Utilisable avec précaution",
  MINEUR: "À surveiller",
};
