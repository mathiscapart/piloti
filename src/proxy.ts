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
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const sessionCookie = getSessionCookie(request, { cookiePrefix: "piloti" });

  if (!sessionCookie) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await auth.api.getSession({ headers: request.headers });
  // `additionalFields` (dont `status`) sont remontés dans session.user.
  const status = (session?.user as { status?: string } | undefined)?.status;

  if (!session?.user || status !== "ACTIVE") {
    // Cookie stale ou compte non-ACTIVE → clear + reroute
    const target = isPublic
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", request.url));
    target.cookies.delete(COOKIE_NAME);
    return target;
  }

  // Session ACTIVE sur page publique → dashboard
  if (isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tout sauf : /api/*, /_next/static, /_next/image, /favicon.ico, /uploads/*,
    // et tout chemin contenant un point (fichier statique).
    "/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\.[\\w]+).*)",
  ],
};
