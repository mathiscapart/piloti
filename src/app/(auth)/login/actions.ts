"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACCOUNT_NOT_ACTIVE_CODE, auth } from "@/lib/auth";

export interface SignInActionResult {
  error: string | null;
}

const schema = z.object({
  email: z.string().email("Email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

/**
 * NB : `auth.api.signInEmail` retourne le user avec ses additionalFields
 * (dont `status`) directement. Pas besoin d'un `getSession` après — celui-ci
 * ne verrait pas le cookie de la session qu'on vient juste de poser (le cookie
 * est sur la response, pas sur la request courante).
 *
 * SEC-08 (Vuln 4) — le gate par statut ne vit plus ici : le hook
 * `databaseHooks.session.create.before` (src/lib/auth.ts) refuse la création
 * de session à la source pour tout compte non-ACTIVE ou `canLogin: false`, et
 * porte le message précis dans l'APIError. Poser le cookie PUIS le retirer
 * après coup (signOut) laissait une fenêtre exploitable en appelant
 * directement POST /api/auth/sign-in/email.
 */
export async function signInAction(
  _prev: SignInActionResult,
  formData: FormData,
): Promise<SignInActionResult> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  let user: Awaited<ReturnType<typeof auth.api.signInEmail>>["user"];
  try {
    const result = await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
    user = result.user;
  } catch (e) {
    if (e instanceof APIError && e.body?.code === ACCOUNT_NOT_ACTIVE_CODE) {
      return { error: e.body.message ?? "Ce compte ne peut pas se connecter." };
    }
    return { error: "Email ou mot de passe incorrect." };
  }

  if (!user) return { error: "Erreur de connexion." };

  // SAFE-01 — profil incomplet (pas de date de naissance). Les quatre chemins
  // de création l'imposent (register, setup, createChildAccount, seed) : un
  // compte ACTIVE sans date est une anomalie de données, pas une étape
  // utilisateur. On refuse ici plutôt que de proposer un écran de complétion :
  // cette date gouverne la protection des mineurs, elle ne se déclare pas en
  // libre-service. Le message part avant tout redirect, donc l'utilisateur sait
  // quoi faire ; le cookie de session posé par signInEmail sera balayé par le
  // proxy à la première navigation (même branche que les comptes non-ACTIVE).
  if (!user.birthDate) {
    return {
      error:
        "Ce compte est incomplet (date de naissance manquante). Contacte un responsable pour la renseigner.",
    };
  }

  redirect("/dashboard");
}
