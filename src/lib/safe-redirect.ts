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

/**
 * Valide le paramètre `next` reçu par la page de connexion. N'accepte qu'un
 * chemin interne (un seul `/` initial, ni `\`, ni caractère de contrôle, y
 * compris sous forme encodée `%2f`, `%5c`, `%09`…) qui, une fois résolu, reste
 * sur la même origine et ne vise ni une page d'authentification ni l'API.
 * Tout le reste retombe sur le tableau de bord.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next.length > MAX_NEXT_LENGTH) return DEFAULT_AFTER_LOGIN;
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_AFTER_LOGIN;
  // Les navigateurs lisent `\` comme `/` (`/\example.com` → `//example.com`).
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_AFTER_LOGIN;

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== BASE) return DEFAULT_AFTER_LOGIN;

  // Mêmes règles sur le chemin décodé : un intermédiaire (proxy, CDN) qui
  // décoderait `/%2f%2fevil.com` en `//evil.com` ne doit rien en tirer.
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) {
    return DEFAULT_AFTER_LOGIN;
  }

  // Insensible à la casse : `/LOGIN` n'existe pas, inutile d'y atterrir.
  const lower = decoded.toLowerCase();
  const page = lower.length > 1 ? lower.replace(/\/+$/, "") : lower;
  if (AUTH_PATHS.has(page)) return DEFAULT_AFTER_LOGIN;
  if (NON_PAGE_PREFIXES.some((p) => page === p || page.startsWith(`${p}/`))) {
    return DEFAULT_AFTER_LOGIN;
  }

  return url.pathname + url.search + url.hash;
}

/**
 * Valeur de `next` à joindre à l'URL de connexion pour la requête refusée, ou
 * `null` s'il n'y a rien à mémoriser : la racine, ou un chemin que
 * `safeNextPath` rejetterait de toute façon (trop long, page d'auth…).
 */
export function nextForLogin(pathname: string, search: string): string | null {
  if (pathname === "/") return null;
  const next = pathname + search;
  return safeNextPath(next) === next ? next : null;
}
