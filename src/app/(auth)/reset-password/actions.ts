"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";

export interface ResetPasswordResult {
  error: string | null;
}

const schema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirmez le mot de passe."),
    token: z.string().min(1, "Token manquant."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

export async function resetPasswordAction(
  _prev: ResetPasswordResult,
  formData: FormData,
): Promise<ResetPasswordResult> {
  const parsed = schema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  try {
    await auth.api.resetPassword({
      body: {
        newPassword: parsed.data.newPassword,
        token: parsed.data.token,
      },
      headers: await headers(),
    });
  } catch (e) {
    console.error("[resetPassword]", e);
    return {
      error:
        "Lien invalide ou expiré. Recommencez depuis la page de connexion.",
    };
  }

  redirect("/login?reset=1");
}
