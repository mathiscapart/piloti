"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";

export interface ForgotPasswordResult {
  error: string | null;
  sent: boolean;
}

const schema = z.object({
  email: z.string().email("Email invalide."),
});

export async function forgotPasswordAction(
  _prev: ForgotPasswordResult,
  formData: FormData,
): Promise<ForgotPasswordResult> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email invalide.", sent: false };
  }

  try {
    // better-auth 1.6 : la route /forget-password n'existe plus, elle a été
    // renommée /request-password-reset. On appelle la méthode typée plutôt que
    // de fabriquer une Request — les headers réels donnent aussi son IP au
    // rate-limiter.
    await auth.api.requestPasswordReset({
      body: {
        email: parsed.data.email,
        redirectTo: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/reset-password`,
      },
      headers: await headers(),
    });
  } catch (e) {
    console.error("[forgotPassword]", e);
    return {
      error: "Impossible d'envoyer l'email. Réessayez ou contactez un administrateur.",
      sent: false,
    };
  }

  // Toujours succès pour éviter l'énumération d'emails
  return { error: null, sent: true };
}
