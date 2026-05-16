import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "12 caractères minimum.")
  .regex(/[A-Z]/, "Au moins une lettre majuscule.")
  .regex(/[a-z]/, "Au moins une lettre minuscule.")
  .regex(/[0-9]/, "Au moins un chiffre.");

export const PASSWORD_HINT =
  "12 caractères minimum, avec majuscule, minuscule et chiffre.";
