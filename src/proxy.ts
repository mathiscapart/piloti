import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/register"]);
const COOKIE_NAME = "piloti.session_token";

/**
 * Next.js 16 — `proxy` remplace `middleware`. Cf. DECISIONS.md D-005.
 *
 * Stratégie défense en profondeur :
 *   1. Fast path : pas de cookie + route protégée → /login.
 *   2. Cookie présent : on valide la session via `auth.api.getSession`.
 *      Si invalide ou compte non-ACTIVE → on clear le cookie + redirect /login.
 *   3. Cookie valide + page publique → /dashboard.
 *
 * Important : on doit faire le clear du cookie ici (NextResponse permet
 * `response.cookies.delete`) parce qu'un `redirect()` depuis un Server Component
 * (layout) ne peut pas modifier les cookies de la réponse.
 */
/**
 * Construit un redirect avec Cache-Control: no-store.
 *
 * Sans ça, Cloudflare met en cache les 307 servis sur des URLs en `.webp`
 * (default rules sur les extensions statiques) et ressert le redirect même
 * quand le client devient authentifié — résultat : les photos d'incident
 * s'affichent en blanc sur la PWA iOS après le 1er chargement non-authed.
 */
function noStoreRedirect(url: URL): NextResponse {
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store, private");
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const sessionCookie = getSessionCookie(request, { cookiePrefix: "piloti" });

  if (!sessionCookie) {
    if (isPublic) return NextResponse.next();
    return noStoreRedirect(new URL("/login", request.url));
  }

  const session = await auth.api.getSession({ headers: request.headers });
  // `additionalFields` (dont `status`) sont remontés dans session.user.
  const status = (session?.user as { status?: string } | undefined)?.status;

  if (!session?.user || status !== "ACTIVE") {
    // Cookie stale ou compte non-ACTIVE → clear + reroute
    const target = isPublic
      ? NextResponse.next()
      : noStoreRedirect(new URL("/login", request.url));
    target.cookies.delete(COOKIE_NAME);
    return target;
  }

  // Session ACTIVE sur page publique → dashboard
  if (isPublic) {
    return noStoreRedirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Routes app — tout sauf : /api/*, /_next/*, /favicon.ico, /uploads/*,
    // et les fichiers statiques (avec extension).
    "/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\.[\\w]+).*)",
    // ...mais on RE-MATCH /uploads/* explicitement pour gater les photos
    // d'incidents (S-2). Sans session ACTIVE → redirect /login, donc
    // <img src="/uploads/..."> ne renvoie le binaire qu'à un utilisateur
    // authentifié (le cookie same-origin part avec la requête image).
    "/uploads/:path*",
  ],
};
