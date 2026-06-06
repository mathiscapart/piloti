"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { UNITS } from "@/lib/enums";
import { passwordSchema } from "@/lib/password-policy";

export interface SignUpActionResult {
  error: string | null;
  success: string | null;
}

const schema = z
  .object({
    firstName: z.string().trim().min(1, "Prénom requis."),
    lastName: z.string().trim().min(1, "Nom requis."),
    email: z.string().email("Email invalide."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Veuillez confirmer le mot de passe."),
    // US-26 — profil : parent (sans unité) ou membre d'une unité.
    profileType: z.enum(["UNIT", "PARENT"]).default("UNIT"),
    unit: z
      .union([z.enum(UNITS), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
    phone: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

export async function signUpAction(
  _prev: SignUpActionResult,
  formData: FormData,
): Promise<SignUpActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Données invalides.",
      success: null,
    };
  }

  const isParent = parsed.data.profileType === "PARENT";

  try {
    await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        // Un parent n'est pas rattaché à une unité (branche).
        unit: isParent ? undefined : parsed.data.unit,
        phone: parsed.data.phone,
      },
      headers: await headers(),
    });
    // US-26 — mémorise le profil demandé pour guider l'admin à la validation
    // (rôle non attribué ici : l'admin reste seul à valider, cf. US-32).
    if (isParent) {
      await db.user.update({
        where: { email: parsed.data.email },
        data: { requestedRole: "PARENT" },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("already") || msg.includes("exist")) {
      return {
        error: "Un compte existe déjà avec cet email.",
        success: null,
      };
    }
    return {
      error: "Erreur lors de l'inscription. Réessayez dans un instant.",
      success: null,
    };
  }

  return {
    error: null,
    success:
      "Compte créé ! Votre inscription est en attente de validation par un administrateur.",
  };
}
