"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { birthDateSchema } from "@/lib/legal/age";
import { passwordSchema } from "@/lib/password-policy";

export interface SetupActionResult {
  error: string | null;
}

const schema = z
  .object({
    firstName: z.string().trim().min(1, "Prénom requis."),
    lastName: z.string().trim().min(1, "Nom requis."),
    email: z.string().email("Email invalide."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirmez le mot de passe."),
    // SAFE-01 — ACTIVE implique une date de naissance connue (cf.
    // src/app/(app)/layout.tsx) : autant la demander à la création de l'admin
    // plutôt que de le rediriger vers /completer-profil juste après. Même
    // validation que l'inscription (birthDateSchema, source unique).
    birthDate: birthDateSchema,
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

export async function setupAction(
  _prev: SetupActionResult,
  formData: FormData,
): Promise<SetupActionResult> {
  // Guard : refuser si un utilisateur existe déjà (setup déjà fait).
  const count = await db.user.count();
  if (count > 0) {
    return { error: "Un compte administrateur existe déjà." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  // 1. Créer l'utilisateur via better-auth (hash du mot de passe, création Account)
  try {
    await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
      },
      headers: await headers(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("already") || msg.includes("exist")) {
      return { error: "Un compte existe déjà avec cet email." };
    }
    return { error: "Erreur lors de la création du compte. Réessayez." };
  }

  // 2. Passer le compte en ACTIVE + ADMIN (better-auth crée PENDING + CHEF par défaut)
  await db.user.update({
    where: { email: parsed.data.email },
    data: { status: "ACTIVE", role: "ADMIN", emailVerified: true },
  });

  // 3. Connecter l'administrateur directement
  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch {
    // Connexion échouée — le compte est créé, rediriger vers login
    redirect("/login");
  }

  redirect("/dashboard");
}
