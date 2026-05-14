"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";

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
  } catch {
    return { error: "Email ou mot de passe incorrect." };
  }

  if (!user) return { error: "Erreur de connexion." };

  // Gate par statut. Si non-ACTIVE, on signOut côté serveur ; même si le
  // cookie persistait côté client, `src/proxy.ts` le clearait dès la requête
  // suivante (validation session + statut).
  const hdrs = await headers();
  if (user.status === "PENDING") {
    await auth.api.signOut({ headers: hdrs });
    return { error: "Compte en attente de validation par un administrateur." };
  }
  if (user.status === "REJECTED") {
    await auth.api.signOut({ headers: hdrs });
    return {
      error: `Inscription refusée${user.rejectedReason ? ` : ${user.rejectedReason}` : "."}`,
    };
  }
  if (user.status === "SUSPENDED") {
    await auth.api.signOut({ headers: hdrs });
    return { error: "Compte suspendu. Contactez un administrateur." };
  }

  redirect("/dashboard");
}
