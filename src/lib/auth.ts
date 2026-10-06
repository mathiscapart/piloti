import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";

import { enforceAuthRateLimit, recordAuthOutcome } from "@/lib/auth-rate-limit";
import { db } from "@/lib/db";
// SEC-08 (Vuln 5) — `user.name` est un texte libre modifiable par le
// titulaire du compte : ce gabarit-ci vit hors de `notificationEmailHtml()`,
// il doit donc échapper lui-même.
import { escapeHtml } from "@/lib/email";
import { canEnableLogin } from "@/lib/legal/age";
import { passwordSchema } from "@/lib/password-policy";

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
      const { error } = await resend.emails.send({
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
      // Le SDK Resend ne jette pas sur une erreur d'API : sans ce test, un refus
      // (domaine non vérifié, quota) passerait pour un envoi réussi.
      if (error) throw new Error(`Resend: ${error.name} — ${error.message}`);
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
    // #147 — derrière cloudflared + Traefik, X-Forwarded-For porte l'IP du
    // conteneur cloudflared : sans ce réglage, le limiteur intégré compte tout
    // le groupe comme une seule IP. Cf-Connecting-Ip est posé par l'edge
    // Cloudflare, seul point d'entrée en prod (aucun port publié).
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
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
            select: { status: true, canLogin: true, rejectedReason: true, birthDate: true },
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
          // SAFE-01 — profil incomplet (pas de date de naissance). Les quatre
          // chemins de création l'imposent (register, setup,
          // createChildAccount, seed) : un compte ACTIVE sans date est une
          // anomalie de données, à traiter ici plutôt que de laisser une
          // session s'ouvrir sur un profil que `canEnableLogin` refuserait
          // de toute façon (fail-closed, date absente).
          if (!user.birthDate) {
            throw new APIError("FORBIDDEN", {
              code: ACCOUNT_NOT_ACTIVE_CODE,
              message:
                "Ce compte est incomplet (date de naissance manquante). Contacte un responsable pour la renseigner.",
            });
          }
          // #122 — défense de dernier recours : un compte de moins de 15 ans
          // ne doit jamais obtenir de session, même si `canLogin` a été
          // désynchronisé.
          if (!canEnableLogin(user.birthDate)) {
            throw new APIError("FORBIDDEN", {
              code: ACCOUNT_NOT_ACTIVE_CODE,
              message:
                "Ce compte appartient à un jeune de moins de 15 ans : un parent doit se connecter avec son propre compte pour agir en son nom.",
            });
          }
        },
      },
    },
  },

  // Le changement de mot de passe passe uniquement par la Server Action
  // `changeOwnPassword` (src/app/(app)/compte/actions.ts), seule à écrire
  // l'audit. Un appel HTTP à POST /api/auth/change-password porte une
  // `request` et est refusé ; `auth.api.changePassword` côté serveur n'en porte
  // pas. `minPasswordLength` ne couvrant que la longueur, la politique complète
  // est aussi appliquée ici, pour tout appelant serveur.
  //
  // #147 — les hooks s'exécutent pour le routeur HTTP ET pour `auth.api.*`
  // (dispatchAuthEndpoint), contrairement au `rateLimit` ci-dessous qui ne voit
  // que le HTTP : c'est ici que les Server Actions de connexion, inscription et
  // mot de passe oublié/réinitialisation sont limitées (src/lib/auth-rate-limit.ts).
  // #153 — sauf le changement de mot de passe : ce hook tourne avant la
  // résolution de la session, il ignore donc le compte visé. `changeOwnPassword`
  // le limite elle-même.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      await enforceAuthRateLimit(ctx.path, ctx.body, ctx.headers);
      if (ctx.path !== "/change-password") return;
      if (ctx.request) {
        throw new APIError("FORBIDDEN", {
          message: "Changez votre mot de passe depuis la page « Mon compte ».",
        });
      }
      const parsed = passwordSchema.safeParse(ctx.body?.newPassword);
      if (!parsed.success) {
        throw new APIError("BAD_REQUEST", {
          message: parsed.error.issues[0]?.message,
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const alertEmail = await recordAuthOutcome(
        ctx.path,
        ctx.body,
        ctx.headers,
        ctx.context.returned,
      );
      // Sans await : une réponse plus lente quand le compte existe trahirait
      // son existence. Import dynamique : le module est `server-only`, or
      // prisma/seed.ts importe ce fichier hors de Next.
      if (alertEmail) {
        void import("@/modules/notifications/security-alert")
          .then((m) => m.alertBlockedSignIn(alertEmail))
          .catch((e) => console.error("[auth] alerte de sécurité non envoyée:", e));
      }
    }),
  },

  // #153 — POST /api/auth/verify-password répond « mot de passe faux » à toute
  // session, sans autre limite que la limite globale par IP : le même oracle
  // que le changement de mot de passe. L'application ne s'en sert pas.
  disabledPaths: ["/verify-password"],

  // Rate limit anti-bruteforce + anti-flood — routes HTTP /api/auth seulement ;
  // les appels `auth.api.*` des Server Actions sont limités par les hooks.
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
