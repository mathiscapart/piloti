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
  // US-CM-01 — un compte enfant sans connexion propre ne doit jamais garder de
  // session valide (même si un cookie a été forgé/rejoué) : même traitement
  // qu'un statut non-ACTIVE.
  const canLogin = (session?.user as { canLogin?: boolean } | undefined)?.canLogin;
  // SAFE-01 — date de naissance manquante. Les quatre chemins de création
  // l'imposent (register, setup, createChildAccount, seed) : un compte ACTIVE
  // sans date est donc une anomalie de données, pas une étape utilisateur. On
  // refuse la session au lieu de proposer de la compléter soi-même — la date
  // gouverne la protection des mineurs, elle ne se déclare pas en libre-service
  // (correction par un administrateur, cf. setUserBirthDate).
  const birthDate = (session?.user as { birthDate?: unknown } | undefined)?.birthDate;

  if (!session?.user || status !== "ACTIVE" || canLogin === false || !birthDate) {
    // Cookie stale, compte non-ACTIVE, compte enfant sans connexion ou profil
    // incomplet → clear + reroute
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
  // Le 1er motif exclut déjà `uploads` ET les fichiers statiques : les images
  // uploadées (annonces, photos d'incidents) sont servies comme des fichiers
  // statiques (chemins en UUID aléatoire, non devinables). NE PAS rajouter
  // "/uploads/:path*" ici : ça forçait le middleware sur ces requêtes → 307 vers
  // /login → images jamais affichées.
  //
  // SEC-08 — ce motif décide quelles requêtes passent par le contrôle
  // d'authentification : deux formulations successives s'y sont fait piéger.
  //   `.*\.[\w]+`     : `.` matche aussi `/`, donc un segment dynamique
  //                     contenant un point (`/communication/x.1`,
  //                     `/messages/abc.1`) passait pour un fichier statique et
  //                     sautait le proxy — contournement du contrôle de statut
  //                     de compte sur les Server Actions.
  //   `[^/]+\.[\w]+$` : corrigeait ça, mais `[^/]+` ne peut pas traverser un
  //                     `/` et l'ancrage part juste après le `/` initial —
  //                     donc plus AUCUN fichier en sous-dossier n'était exclu
  //                     (`/icons/icon-192.png`, `/logo/*.svg`,
  //                     `/leaflet-images/*.png`) → 307 vers /login, icônes PWA
  //                     et logos cassés pour un visiteur non connecté.
  // → On énumère donc les extensions statiques réelles, ancrées en fin de
  //   chemin : un vrai fichier est exclu quel que soit son dossier, alors qu'un
  //   segment dynamique comme `/communication/x.1` (extension « 1 » inconnue)
  //   reste protégé.
  // Toute modification ici doit être revalidée par `src/proxy.test.ts`, qui
  // compile le motif avec la mécanique de Next au lieu de le lire à l'œil.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|uploads|.*[.](?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|mjs|json|webmanifest|woff|woff2|ttf|map|txt|xml)$).*)",
  ],
};
