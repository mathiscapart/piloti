import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";

import { db } from "@/lib/db";
// SEC-08 (Vuln 5) — `user.name` est un texte libre modifiable par le
// titulaire du compte : ce gabarit-ci vit hors de `notificationEmailHtml()`,
// il doit donc échapper lui-même.
import { escapeHtml } from "@/lib/email";

// SEC-08 (Vuln 4) — code d'erreur porté par l'APIError du hook
// `session.create.before` ci-dessous, repris tel quel par
// src/app/(auth)/login/actions.ts pour distinguer un refus « compte non
// actif » (message précis) d'un échec de credentials (message générique).
export const ACCOUNT_NOT_ACTIVE_CODE = "ACCOUNT_NOT_ACTIVE";

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
          <p>Bonjour ${escapeHtml(user.name)},</p>
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
      // SEC-08 (Vuln 2) — `unit` conditionne l'accès aux salons/DM par
      // branche (cf. src/modules/communication/access.ts et dm-policy.ts) :
      // ce n'est PAS une simple donnée de profil. `input: true` laissait
      // n'importe quel compte connecté se le réattribuer via
      // POST /api/auth/update-user, sans passer par `user.manage`. Positionné
      // uniquement côté serveur, après signUpEmail (register/actions.ts) ou
      // par setUserUnit (admin/actions.ts, gardé par can()).
      unit: { type: "string", required: false, input: false },
      phone: { type: "string", required: false, input: true },
      rejectedReason: { type: "string", required: false, input: false },
      // RGPD-02 — date de naissance, saisie à l'inscription (détermine le
      // besoin de consentement parental). Le consentement lui-même n'est PAS
      // un additionalField : il vit dans la table Consent (append-only).
      // SEC-08 (Vuln 2) — même raisonnement que `unit` : détermine SAFE-01
      // (accès DM aux mineurs), donc jamais réassignable après coup par le
      // titulaire du compte lui-même. Positionné une seule fois, à l'inscription.
      birthDate: { type: "date", required: false, input: false },
      // US-CM-01 — compte enfant sans connexion (parent agit à sa place).
      // Jamais settable depuis un formulaire public : uniquement positionné
      // par `createChildAccount` (src/modules/admin/actions.ts).
      canLogin: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },

  advanced: {
    cookiePrefix: "piloti",
  },

  // SEC-08 (Vuln 4) — `/api` est exclu du proxy (src/proxy.ts) et
  // `emailAndPassword` ne connaît pas notre notion de statut de compte.
  // signInAction (login/actions.ts) posait le cookie via signInEmail PUIS
  // vérifiait le statut pour signOut si besoin : entre les deux, un appel
  // direct à POST /api/auth/sign-in/email récupérait un cookie de session
  // valide pour un compte PENDING/REJECTED/SUSPENDED ou canLogin:false. Ce
  // hook ferme la fenêtre à la source, pour TOUT chemin de création de
  // session (Server Action ou appel API direct) : aucune session n'est créée
  // pour un compte non-ACTIVE, un point c'est tout.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { status: true, canLogin: true, rejectedReason: true },
          });
          if (!user || user.status !== "ACTIVE") {
            const message =
              user?.status === "REJECTED"
                ? `Inscription refusée${user.rejectedReason ? ` : ${user.rejectedReason}` : "."}`
                : user?.status === "SUSPENDED"
                  ? "Compte suspendu. Contactez un administrateur."
                  : "Compte en attente de validation par un administrateur.";
            throw new APIError("FORBIDDEN", { code: ACCOUNT_NOT_ACTIVE_CODE, message });
          }
          // US-CM-01 — compte enfant sans connexion propre (parent agit à sa place).
          if (user.canLogin === false) {
            throw new APIError("FORBIDDEN", {
              code: ACCOUNT_NOT_ACTIVE_CODE,
              message:
                "Ce compte est un compte enfant, géré par un parent. Un parent doit se connecter avec son propre compte pour agir en son nom.",
            });
          }
        },
      },
    },
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
