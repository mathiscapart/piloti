import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";

import { db } from "@/lib/db";

// Fail-fast : sans secret, better-auth en génère un aléatoire au boot →
// toutes les sessions invalidées au prochain restart, casse l'auth en
// silence. On veut planter immédiatement.
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET manquant. Génère avec `openssl rand -hex 32` " +
      "et ajoute-le à .env (dev) ou .env.production (prod).",
  );
}

// Origines de confiance supplémentaires (en plus de baseURL) — utile pour
// accéder au dev depuis un autre appareil du LAN (ex. téléphone). Liste
// séparée par des virgules dans TRUSTED_ORIGINS.
const extraTrustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "sqlite" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: extraTrustedOrigins,

  emailAndPassword: {
    enabled: true,
    // Pas d'autoSignIn : un nouveau compte est PENDING par défaut et ne doit pas
    // recevoir de session tant qu'un ADMIN ne l'a pas validé.
    autoSignIn: false,
    minPasswordLength: 12,
    // Révoque toutes les sessions existantes quand un mot de passe est réinitialisé.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const fromEmail =
        process.env.RESEND_FROM_EMAIL ?? "noreply@piloti.mathiscapart.xyz";
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: "Réinitialisation de votre mot de passe Piloti",
        html: `
          <p>Bonjour ${user.name},</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe Piloti.</p>
          <p>Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :</p>
          <p><a href="${url}" style="color:#1a7a4a;font-weight:bold;">${url}</a></p>
          <p style="color:#888;font-size:12px;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
        `,
      });
    },
  },

  // Champs Piloti exposés via le User table (cf. prisma/schema.prisma)
  user: {
    additionalFields: {
      firstName: { type: "string", required: true, input: true },
      lastName: { type: "string", required: true, input: true },
      role: {
        type: "string",
        required: false,
        defaultValue: "CHEF",
        input: false, // jamais settable côté signup
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "PENDING",
        input: false,
      },
      unit: { type: "string", required: false, input: true },
      phone: { type: "string", required: false, input: true },
      rejectedReason: { type: "string", required: false, input: false },
      // RGPD-02 — date de naissance, saisie à l'inscription (détermine le
      // besoin de consentement parental). Le consentement lui-même n'est PAS
      // un additionalField : il vit dans la table Consent (append-only).
      birthDate: { type: "date", required: false, input: true },
    },
  },

  advanced: {
    cookiePrefix: "piloti",
  },

  // Rate limit anti-bruteforce + anti-flood
  rateLimit: {
    enabled: true,
    window: 60 * 15, // 15 min
    max: 100, // limite globale large
    customRules: {
      "/sign-in/email": { window: 60 * 15, max: 5 }, // 5 tentatives / 15 min
      "/sign-up/email": { window: 60 * 15, max: 3 }, // 3 inscriptions / 15 min / IP
    },
  },

  // Plugin obligatoire pour que les Server Actions Next.js posent bien les
  // cookies de session via `cookies()` (sinon `signInEmail`/`signOut` ne
  // peuvent pas écrire le cookie de réponse depuis une Action).
  plugins: [nextCookies()],

  // Slot OAuth SGDF — voir lib/auth-providers.ts pour activation future.
  // socialProviders: { ... }
});

export type AuthInstance = typeof auth;
