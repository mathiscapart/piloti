import { APIError } from "better-auth";
import { isAPIError } from "better-auth/api";
import { RateLimiterMemory, type RateLimiterRes } from "rate-limiter-flexible";

// #147 — limite anti-bruteforce des routes d'authentification, branchée dans
// les hooks better-auth (src/lib/auth.ts). Le limiteur intégré de better-auth
// ne voit que les requêtes HTTP : les Server Actions appellent `auth.api.*`,
// qui passe par les hooks mais pas par ce limiteur. Choix détaillés : D-035.

// Code porté par l'APIError 429, repris par les Server Actions pour afficher
// le message de dépassement au lieu de leur message d'échec habituel.
export const RATE_LIMITED_CODE = "RATE_LIMITED";

// Fenêtres en secondes. Chaque compteur expire seul à la fin de sa fenêtre :
// aucun verrouillage définitif.
export const AUTH_RATE_LIMITS = {
  // Échecs de connexion consécutifs sur un compte depuis une IP. Clé email+IP :
  // un attaquant depuis une autre IP ne bloque pas le titulaire légitime.
  loginFailsByEmailAndIp: { points: 5, duration: 15 * 60 },
  // Échecs par IP, tous comptes confondus (pulvérisation de mots de passe).
  // Large : une IP peut être partagée (wifi d'un local, d'un camp, CGNAT).
  loginFailsByIp: { points: 30, duration: 60 * 60 },
  // Demandes « mot de passe oublié » par adresse ciblée, quelle que soit l'IP :
  // borne le nombre d'emails qu'une adresse peut recevoir. Le lien vaut 1 h.
  resetRequestsByEmail: { points: 3, duration: 60 * 60 },
  // Demandes « mot de passe oublié » par IP, toutes adresses confondues : une
  // IP ne peut pas arroser beaucoup d'adresses (quota Resend, réputation).
  resetRequestsByIp: { points: 10, duration: 60 * 60 },
  // Inscriptions par IP : les comptes restent PENDING mais remplissent la table.
  signUpsByIp: { points: 5, duration: 60 * 60 },
  // Réinitialisations par IP : le jeton n'est pas devinable, simple garde-fou.
  passwordResetsByIp: { points: 10, duration: 15 * 60 },
  // Alertes « connexion bloquée » envoyées au titulaire : une par heure au plus,
  // pour qu'un attaquant qui change d'IP n'inonde pas sa boîte.
  signInAlertsByEmail: { points: 1, duration: 60 * 60 },
} as const;

type LimiterName = keyof typeof AUTH_RATE_LIMITS;
type Counter = { limiter: LimiterName; key: string };

export interface AuthRateLimitPlan {
  // Consommés à chaque requête, avant l'endpoint.
  everyRequest: Counter[];
  // Consommés avant l'endpoint, rendus ensuite si ce n'était pas un échec
  // d'identifiants. Consommer d'abord empêche des requêtes simultanées de
  // passer toutes avant que le premier échec soit compté.
  failures: Counter[];
  // Remis à zéro quand la connexion réussit.
  resetOnSuccess: Counter[];
}

// En prod, Traefik réécrit X-Forwarded-For avec l'IP du conteneur cloudflared ;
// seul Cf-Connecting-Ip, posé par l'edge Cloudflare, porte l'IP du client.
export function clientIp(headers: Headers | null | undefined): string {
  return headers?.get("cf-connecting-ip")?.trim() || "unknown";
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase() || null;
}

export function authRateLimitPlan(
  path: string,
  email: string | null,
  ip: string,
): AuthRateLimitPlan | null {
  const plan: AuthRateLimitPlan = { everyRequest: [], failures: [], resetOnSuccess: [] };
  const normalized = normalizeEmail(email);
  switch (path) {
    case "/sign-in/email":
      if (normalized) {
        const byEmailAndIp: Counter = {
          limiter: "loginFailsByEmailAndIp",
          key: `${normalized}|${ip}`,
        };
        plan.failures.push(byEmailAndIp);
        plan.resetOnSuccess.push(byEmailAndIp);
      }
      plan.failures.push({ limiter: "loginFailsByIp", key: ip });
      return plan;
    case "/request-password-reset":
      if (normalized) plan.everyRequest.push({ limiter: "resetRequestsByEmail", key: normalized });
      plan.everyRequest.push({ limiter: "resetRequestsByIp", key: ip });
      return plan;
    case "/sign-up/email":
      plan.everyRequest.push({ limiter: "signUpsByIp", key: ip });
      return plan;
    case "/reset-password":
      plan.everyRequest.push({ limiter: "passwordResetsByIp", key: ip });
      return plan;
    default:
      return null;
  }
}

// Seul un 401 (identifiants invalides) compte comme échec. Un refus « compte
// non actif » (403) suit un mot de passe correct : ni échec ni succès.
export function classifyOutcome(returned: unknown): "success" | "failure" | "other" {
  if (!isAPIError(returned)) return "success";
  return returned.statusCode === 401 ? "failure" : "other";
}

// Message à afficher par une Server Action si `e` est un dépassement, sinon null.
export function rateLimitMessage(e: unknown): string | null {
  return isAPIError(e) && e.body?.code === RATE_LIMITED_CODE ? (e.body.message ?? null) : null;
}

// Un dépassement rejette avec un RateLimiterRes, une panne avec une Error (cf.
// doc de rate-limiter-flexible). Pas d'`instanceof RateLimiterRes` : Next charge
// ce module dans plusieurs bundles, et les limiteurs partagés via globalThis
// peuvent venir d'une autre copie de la librairie.
export function isLimiterRejection(e: unknown): e is RateLimiterRes {
  return typeof e === "object" && e !== null && !(e instanceof Error) && "msBeforeNext" in e;
}

// Instance unique en mémoire (une seule instance de l'app), gardée dans
// globalThis pour survivre au rechargement à chaud. Contrairement à `db`, aussi
// en prod : ce module peut être chargé par plusieurs bundles (routes HTTP,
// Server Actions), qui doivent partager les mêmes compteurs.
const globalForRateLimit = globalThis as unknown as {
  authRateLimiters: Record<LimiterName, RateLimiterMemory> | undefined;
};

const limiters = (globalForRateLimit.authRateLimiters ??= Object.fromEntries(
  Object.entries(AUTH_RATE_LIMITS).map(([name, { points, duration }]) => [
    name,
    new RateLimiterMemory({ keyPrefix: `auth_${name}`, points, duration }),
  ]),
) as Record<LimiterName, RateLimiterMemory>);

function rateLimited(msBeforeNext: number): APIError {
  const minutes = Math.max(1, Math.ceil(msBeforeNext / 60_000));
  return new APIError("TOO_MANY_REQUESTS", {
    code: RATE_LIMITED_CODE,
    message: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
  });
}

function emailOf(body: unknown): string | null {
  return normalizeEmail((body as { email?: unknown } | undefined)?.email);
}

function planFor(path: string, body: unknown, headers: Headers | null | undefined) {
  return authRateLimitPlan(path, emailOf(body), clientIp(headers));
}

/** Hook `before` : lève une APIError 429 si un compteur est épuisé. */
export async function enforceAuthRateLimit(
  path: string,
  body: unknown,
  headers: Headers | null | undefined,
): Promise<void> {
  const plan = planFor(path, body, headers);
  if (!plan) return;

  for (const { limiter, key } of [...plan.failures, ...plan.everyRequest]) {
    try {
      await limiters[limiter].consume(key);
    } catch (e) {
      if (isLimiterRejection(e)) throw rateLimited(e.msBeforeNext);
      throw e;
    }
  }
}

/**
 * Hook `after` : rend le point consommé sauf échec, remet à zéro après un succès.
 * Renvoie l'email du compte dont le titulaire doit être prévenu, quand cet échec
 * vient de bloquer la connexion (au plus une fois par heure et par compte).
 */
export async function recordAuthOutcome(
  path: string,
  body: unknown,
  headers: Headers | null | undefined,
  returned: unknown,
): Promise<string | null> {
  const plan = planFor(path, body, headers);
  if (!plan) return null;

  const outcome = classifyOutcome(returned);
  if (outcome === "failure") return ownerToAlert(plan, emailOf(body));
  for (const { limiter, key } of plan.failures) await limiters[limiter].reward(key, 1);
  if (outcome === "success") {
    for (const { limiter, key } of plan.resetOnSuccess) await limiters[limiter].delete(key);
  }
  return null;
}

async function ownerToAlert(plan: AuthRateLimitPlan, email: string | null): Promise<string | null> {
  const counter = plan.failures.find((c) => c.limiter === "loginFailsByEmailAndIp");
  if (!counter || !email) return null;
  const res = await limiters.loginFailsByEmailAndIp.get(counter.key);
  // `>=` et non `===` : des requêtes simultanées rejetées gonflent le compteur
  // avant que ce hook ne le lise. Le limiteur d'alertes dédoublonne.
  if (!res || res.consumedPoints < AUTH_RATE_LIMITS.loginFailsByEmailAndIp.points) return null;
  try {
    await limiters.signInAlertsByEmail.consume(email);
    return email;
  } catch (e) {
    if (isLimiterRejection(e)) return null;
    throw e;
  }
}
