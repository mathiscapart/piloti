// #85 — retour sur la page demandée après connexion, sans redirection ouverte.

export const DEFAULT_AFTER_LOGIN = "/dashboard";

/** Au-delà, la valeur n'est pas un lien profond légitime : on l'ignore. */
export const MAX_NEXT_LENGTH = 2048;

/** Pages d'authentification : y renvoyer après connexion n'a pas de sens. */
const AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/setup",
]);

/** Préfixes non navigables : routes d'API et fichiers internes de Next. */
const NON_PAGE_PREFIXES = ["/api", "/_next"];

// Origine fictive : sert uniquement à vérifier que le chemin ne la quitte pas.
const BASE = "http://piloti.invalid";

// `\` est lu comme `/` par les navigateurs (`/\example.com` → `//example.com`).
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

/** Un seul `/` initial, ni `\`, ni caractère de contrôle. */
function isPlainPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !UNSAFE_CHARS.test(path);
}

/**
 * Chemin interne normalisé, ou `null` si `next` n'en est pas un : non textuel,
 * trop long, chemin piégé (y compris sous forme encodée `%2f`, `%5c`, `%09`…),
 * hors de l'origine une fois résolu, page d'authentification ou API.
 */
function internalPath(next: unknown): string | null {
  if (typeof next !== "string" || next.length > MAX_NEXT_LENGTH || !isPlainPath(next)) {
    return null;
  }

  let url: URL;
  let decoded: string;
  try {
    url = new URL(next, BASE);
    // Mêmes règles sur le chemin décodé : un intermédiaire (proxy, CDN) qui
    // décoderait `/%2f%2fevil.com` en `//evil.com` ne doit rien en tirer.
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (url.origin !== BASE || !isPlainPath(decoded)) return null;

  // Insensible à la casse et au `/` final : `/LOGIN` et `/login/` sont refusés.
  const page = decoded.toLowerCase().replace(/\/+$/, "");
  if (AUTH_PATHS.has(page)) return null;
  if (NON_PAGE_PREFIXES.some((prefix) => `${page}/`.startsWith(`${prefix}/`))) return null;

  return url.pathname + url.search + url.hash;
}

/**
 * Valide le paramètre `next` reçu par la page de connexion : le chemin interne
 * normalisé, ou le tableau de bord pour toute autre valeur.
 */
export function safeNextPath(next: unknown): string {
  return internalPath(next) ?? DEFAULT_AFTER_LOGIN;
}

/**
 * Valeur de `next` à joindre à l'URL de connexion pour la requête refusée, ou
 * `null` s'il n'y a rien à mémoriser : la racine, ou un chemin que
 * `safeNextPath` ne rendrait pas tel quel (trop long, page d'auth…).
 */
export function nextForLogin(pathname: string, search: string): string | null {
  const next = pathname + search;
  return pathname !== "/" && internalPath(next) === next ? next : null;
}
