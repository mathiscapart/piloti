"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { clientIp, rateLimitMessage } from "@/lib/auth-rate-limit";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { UNITS } from "@/lib/enums";
import {
  birthDateSchema,
  canSelfRegister,
  MIN_LOGIN_AGE,
  requiresParentalConsent,
} from "@/lib/legal/age";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/versions";
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
    birthDate: birthDateSchema,
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
    // RGPD-02 (amendé, US-CM-04) — attestation parentale, requise pour tout
    // mineur (moins de 18 ans, cf. superRefine ci-dessous).
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
    // US-CM-04 — refus sec en dessous de MIN_LOGIN_AGE. Ce contrôle vient AVANT
    // celui du consentement parental, et coupe court : afficher en plus « il
    // manque l'autorisation parentale » laisserait croire qu'une case cochée
    // débloquerait l'inscription, alors qu'aucune case ne le peut.
    if (!canSelfRegister(d.birthDate)) {
      ctx.addIssue({
        code: "custom",
        message: `L'inscription en ligne est réservée aux ${MIN_LOGIN_AGE} ans et plus. Demande à un parent ou à un chef de créer ta fiche.`,
        path: ["birthDate"],
      });
      return;
    }

    if (!requiresParentalConsent(d.birthDate)) return;
    if (d.acceptParental !== "on") {
      ctx.addIssue({
        code: "custom",
        message:
          "L'autorisation d'un responsable légal est requise tant que le jeune est mineur.",
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
  const minor = requiresParentalConsent(parsed.data.birthDate);
  const requestHeaders = await headers();
  // D-035 — X-Forwarded-For porte l'IP du conteneur cloudflared en prod.
  const ip = clientIp(requestHeaders);

  // Même réponse que l'email soit libre ou déjà inscrit : dire « un compte
  // existe déjà » révélerait qu'une adresse est inscrite (énumération). L'écran
  // de succès renvoie vers « Mot de passe oublié » pour le second cas.
  const success =
    "Demande enregistrée ! Elle est en attente de validation par un administrateur.";

  let createdUserId: string | null = null;

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
      },
      headers: requestHeaders,
    });

    // Email déjà inscrit : avec `autoSignIn: false`, better-auth ne lève pas
    // d'erreur mais renvoie un utilisateur synthétique, jamais écrit en base
    // (anti-énumération). Rien à compléter : même réponse qu'un succès.
    const created = await db.user.findUnique({
      where: { id: result.user.id },
      select: { id: true },
    });
    if (!created) return { error: null, success };
    createdUserId = created.id;

    // SEC-08 (Vuln 2) — `unit` et `birthDate` sont `input: false` côté
    // better-auth (déterminent l'accès aux salons par branche et SAFE-01) :
    // positionnés ici, une seule fois, juste après la création du compte —
    // jamais réassignables ensuite via POST /api/auth/update-user.
    // US-26 — mémorise le profil demandé pour guider l'admin à la validation
    // (rôle non attribué ici : l'admin reste seul à valider, cf. US-32).
    await db.user.update({
      where: { id: createdUserId },
      data: {
        birthDate: parsed.data.birthDate,
        // Un parent n'est pas rattaché à une unité (branche).
        ...(isParent ? { requestedRole: "PARENT" } : { unit: parsed.data.unit }),
      },
    });

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
            ipAddress: ip === "unknown" ? null : ip,
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
    const limited = rateLimitMessage(e);
    if (limited) return { error: limited, success: null };
    return {
      error: "Erreur lors de l'inscription. Réessayez dans un instant.",
      success: null,
    };
  }

  return { error: null, success };
}
