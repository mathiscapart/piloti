"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACCOUNT_NOT_ACTIVE_CODE, auth } from "@/lib/auth";
import { rateLimitMessage } from "@/lib/auth-rate-limit";

export interface SignInActionResult {
  error: string | null;
  // #147 — connexion bloquée : le formulaire propose la réinitialisation.
  rateLimited?: boolean;
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
    const limited = rateLimitMessage(e);
    if (limited) return { error: limited, rateLimited: true };
    if (e instanceof APIError && e.body?.code === ACCOUNT_NOT_ACTIVE_CODE) {
      return { error: e.body.message ?? "Ce compte ne peut pas se connecter." };
    }
    return { error: "Email ou mot de passe incorrect." };
  }

  if (!user) return { error: "Erreur de connexion." };

  redirect("/dashboard");
}
