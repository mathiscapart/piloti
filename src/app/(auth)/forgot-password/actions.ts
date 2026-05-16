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
    // auth.api.forgetPassword n'est pas exposé comme méthode typée en v1.6.
    // On appelle le handler HTTP directement avec une Request synthétique —
    // ça évite un appel HTTP sortant (impossible sur le réseau Docker internal).
    const req = new Request(
      "http://piloti.internal/api/auth/forget-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parsed.data.email,
          redirectTo: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/reset-password`,
        }),
      },
    );
    await auth.handler(req);
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
