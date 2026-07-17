"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { UNITS } from "@/lib/enums";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/versions";
import { passwordSchema } from "@/lib/password-policy";

export interface SignUpActionResult {
  error: string | null;
  success: string | null;
}

// RGPD-02 — en-dessous de ce seuil, l'inscription requiert l'attestation d'un
// responsable légal en plus du consentement de la personne elle-même.
const MINOR_AGE_THRESHOLD = 15;

function isMinor(birthDate: Date): boolean {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassedThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!birthdayPassedThisYear) age -= 1;
  return age < MINOR_AGE_THRESHOLD;
}

const schema = z
  .object({
    firstName: z.string().trim().min(1, "Prénom requis."),
    lastName: z.string().trim().min(1, "Nom requis."),
    email: z.string().email("Email invalide."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Veuillez confirmer le mot de passe."),
    birthDate: z.coerce
      .date("Date de naissance invalide.")
      .min(new Date("1900-01-01"), "Date de naissance invalide.")
      .max(new Date(), "La date de naissance ne peut pas être dans le futur."),
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
    // RGPD-02 — consentement à la politique de confidentialité + aux CGU,
    // obligatoire pour toute inscription.
    acceptPrivacy: z.literal("on", "Vous devez accepter la politique de confidentialité et les CGU."),
    // RGPD-02 — attestation parentale, requise uniquement pour un mineur de
    // moins de 15 ans (cf. superRefine ci-dessous).
    acceptParental: z.literal("on").optional(),
    guardianName: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  })
  .superRefine((d, ctx) => {
    if (!isMinor(d.birthDate)) return;
    if (d.acceptParental !== "on") {
      ctx.addIssue({
        code: "custom",
        message:
          "L'autorisation d'un responsable légal est requise pour les mineurs de moins de 15 ans.",
        path: ["acceptParental"],
      });
    }
    if (!d.guardianName) {
      ctx.addIssue({
        code: "custom",
        message: "Le nom du responsable légal est requis.",
        path: ["guardianName"],
      });
    }
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
  const minor = isMinor(parsed.data.birthDate);
  const requestHeaders = await headers();

  let createdUserId: string | null = null;

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
        // Un parent n'est pas rattaché à une unité (branche).
        unit: isParent ? undefined : parsed.data.unit,
        phone: parsed.data.phone,
      },
      headers: requestHeaders,
    });
    createdUserId = result.user.id;

    // US-26 — mémorise le profil demandé pour guider l'admin à la validation
    // (rôle non attribué ici : l'admin reste seul à valider, cf. US-32).
    if (isParent) {
      await db.user.update({
        where: { id: createdUserId },
        data: { requestedRole: "PARENT" },
      });
    }

    // RGPD-02 — trace du consentement, append-only, dans la même transaction
    // que l'entrée d'audit (cf. CLAUDE.md : toute mutation → AuditLog).
    await withAudit(
      (tx) =>
        tx.consent.create({
          data: {
            userId: createdUserId!,
            type: minor ? "PARENTAL" : "SELF",
            privacyVersion: PRIVACY_VERSION,
            termsVersion: TERMS_VERSION,
            guardianName: minor ? parsed.data.guardianName : undefined,
            ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            userAgent: requestHeaders.get("user-agent"),
          },
        }),
      (consent) => ({
        action: "USER_REGISTERED",
        userId: createdUserId!,
        metadata: {
          consentId: consent.id,
          type: consent.type,
          privacyVersion: consent.privacyVersion,
        },
      }),
    );
  } catch (e) {
    // R1 — si le consentement n'a pas pu être tracé après la création du
    // compte, on ne laisse jamais un compte exister sans preuve de
    // consentement : suppression immédiate (hard-delete) du compte créé.
    if (createdUserId) {
      await db.user.delete({ where: { id: createdUserId } }).catch((delErr) => {
        // La compensation elle-même a échoué : un compte peut subsister sans
        // preuve de consentement. On le trace pour qu'il reste détectable.
        console.error(
          `[RGPD] Échec de la suppression compensatoire du compte ${createdUserId} sans consentement:`,
          delErr,
        );
      });
    }
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
