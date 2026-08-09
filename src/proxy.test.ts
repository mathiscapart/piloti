import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// SEC-08 — le `matcher` de src/proxy.ts décide quelles requêtes passent par le
// contrôle d'authentification. Deux formulations successives s'y sont fait
// piéger, dans les deux sens : la première laissait des routes applicatives
// sauter le proxy (contournement du contrôle de statut de compte), la seconde
// forçait le proxy sur des fichiers statiques (assets renvoyés en 307 vers
// /login). Un motif de middleware ne se relit pas à l'œil : on le compile ici
// avec la propre mécanique de Next et on vérifie le comportement obtenu.
const require = createRequire(import.meta.url);
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info.js");
const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher.js");

// On lit le motif dans le fichier source : Next impose que `config` soit un
// littéral statiquement analysable, on ne peut donc pas l'importer (proxy.ts
// tirerait `@/lib/auth` et toute la config better-auth au passage).
function readMatchers(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL("./proxy.ts", import.meta.url)),
    "utf8",
  );
  // On repère les littéraux du motif par leur forme (`"/((?!…"`) plutôt que par
  // le bloc `matcher: [...]` : le motif contient lui-même des `]`, sur lesquels
  // un découpage par crochets se casserait.
  const found = [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    // Le fichier est du source TS : on déséchappe la chaîne littérale.
    .map((m) => JSON.parse(`"${m[1]}"`) as string)
    .filter((s) => s.startsWith("/((?!"));
  if (found.length === 0) throw new Error("motif introuvable dans src/proxy.ts");
  return found;
}

const runsProxy = (() => {
  const match = getMiddlewareRouteMatcher(
    getMiddlewareMatchers(readMatchers(), {}),
  );
  return (pathname: string): boolean => match(pathname);
})();

describe("proxy matcher", () => {
  // Toute route applicative doit passer par le proxy : c'est là que le statut
  // du compte (ACTIVE / suspendu / refusé) est vérifié avant d'atteindre une
  // page ou une Server Action.
  it.each([
    "/dashboard",
    "/communication/salon-general",
    "/admin/utilisateurs",
    "/planning/nouveau",
    // Segment dynamique contenant un point : passait pour un fichier statique
    // et sautait entièrement le proxy.
    "/communication/x.1",
    "/messages/abc.1",
    "/planning/x.1",
  ])("protège %s", (path) => {
    expect(runsProxy(path)).toBe(true);
  });

  // Les fichiers statiques doivent être servis sans proxy, sinon une requête
  // non authentifiée est redirigée vers /login et l'asset n'est jamais rendu.
  it.each([
    "/favicon.ico",
    "/sw.js",
    "/leaflet.css",
    "/icons/icon-192.png",
    "/icons/apple-touch-icon.png",
    "/logo/piloti-lockup.svg",
    "/leaflet-images/marker-icon.png",
    "/uploads/photo-uuid.jpg",
    "/_next/static/chunks/main.js",
  ])("laisse passer l'asset %s", (path) => {
    expect(runsProxy(path)).toBe(false);
  });
});
