import { z } from "zod";

import { EVENT_TYPES, UNITS } from "@/lib/enums";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

// US-P01 — création / édition d'un événement. Les dates arrivent en chaînes
// `datetime-local` (« YYYY-MM-DDTHH:mm ») ; la conversion + le contrôle
// début ≤ fin se font dans l'action.
export const eventSchema = z.object({
  name: z.string().trim().min(1, "Titre requis.").max(120, "Titre trop long."),
  type: z.enum(EVENT_TYPES),
  startDate: z.string().min(1, "Date de début requise."),
  endDate: z.string().min(1, "Date de fin requise."),
  // "" = tout le groupe → null. Sinon doit être une unité connue.
  unit: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || (UNITS as readonly string[]).includes(v),
      "Branche invalide.",
    ),
  location: optionalText,
  description: optionalText,
});

export type EventInput = z.infer<typeof eventSchema>;
