import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);
// RGPD-01 — pages légales, accessibles à tous sans compte ni base de données
// (même avant le premier lancement / setup).
const LEGAL_PATHS = new Set(["/confidentialite", "/mentions-legales", "/cgu"]);
const SETUP_PATH = "/setup";
const COOKIE_NAME = "piloti.session_token";

function noStoreRedirect(url: URL): NextResponse {
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store, private");
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (LEGAL_PATHS.has(pathname)) return NextResponse.next();

  const sessionCookie = getSessionCookie(request, { cookiePrefix: "piloti" });

  // ── Requêtes non-authentifiées ────────────────────────────────────────────
  if (!sessionCookie) {
    // Détection first-run : uniquement quand pas de cookie (évite la requête DB
    // sur chaque appel authentifié).
    const { db } = await import("@/lib/db");
    const hasUsers = (await db.user.count()) > 0;

    if (!hasUsers) {
      // Base vide → tout le monde va sur /setup
      if (pathname === SETUP_PATH) return NextResponse.next();
      return noStoreRedirect(new URL(SETUP_PATH, request.url));
    }

    // Base non-vide → /setup n'est plus accessible
    if (pathname === SETUP_PATH) {
      return noStoreRedirect(new URL("/login", request.url));
    }

    if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    return noStoreRedirect(new URL("/login", request.url));
  }

  // ── Requêtes authentifiées ────────────────────────────────────────────────

  // /setup inutile si déjà connecté
  if (pathname === SETUP_PATH) {
    return noStoreRedirect(new URL("/dashboard", request.url));
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const status = (session?.user as { status?: string } | undefined)?.status;

  if (!session?.user || status !== "ACTIVE") {
    // Cookie stale ou compte non-ACTIVE → clear + reroute
    const isPublic = PUBLIC_PATHS.has(pathname);
    const target = isPublic
      ? NextResponse.next()
      : noStoreRedirect(new URL("/login", request.url));
    target.cookies.delete(COOKIE_NAME);
    return target;
  }

  // Session ACTIVE sur page publique → dashboard
  if (PUBLIC_PATHS.has(pathname)) {
    return noStoreRedirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Le 1er motif exclut déjà `uploads` ET tout fichier à extension : les images
  // uploadées (annonces, photos d'incidents) sont servies comme des fichiers
  // statiques (chemins en UUID aléatoire, non devinables). NE PAS rajouter
  // "/uploads/:path*" ici : ça forçait le middleware sur ces requêtes → 307 vers
  // /login → images jamais affichées.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\.[\\w]+).*)",
  ],
};
