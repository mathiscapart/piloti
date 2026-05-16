import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

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

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "sqlite" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    // Pas d'autoSignIn : un nouveau compte est PENDING par défaut et ne doit pas
    // recevoir de session tant qu'un ADMIN ne l'a pas validé.
    autoSignIn: false,
    minPasswordLength: 8,
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
