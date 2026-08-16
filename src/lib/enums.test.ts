// Tests de src/lib/enums.ts — pour l'instant limités à `unitAllowsLogin`
// (US-CM-01), seule fonction pure du fichier : le reste n'est que des listes
// de constantes/labels, sans logique à verrouiller.

import { describe, expect, it } from "vitest";
import { NO_LOGIN_UNITS, unitAllowsLogin } from "./enums";

describe("unitAllowsLogin (US-CM-01)", () => {
  it("refuse la connexion pour les branches trop jeunes (Farfadets, Louveteaux)", () => {
    expect(unitAllowsLogin("FARFADETS")).toBe(false);
    expect(unitAllowsLogin("LOUVETEAUX")).toBe(false);
  });

  it("autorise la connexion pour les autres branches", () => {
    expect(unitAllowsLogin("SCOUTS")).toBe(true);
    expect(unitAllowsLogin("PIONNIERS")).toBe(true);
    expect(unitAllowsLogin("COMPAGNONS")).toBe(true);
    expect(unitAllowsLogin("ADULTES")).toBe(true);
  });

  it("autorise par défaut une unité absente ou inconnue (aucune restriction sans branche)", () => {
    expect(unitAllowsLogin(null)).toBe(true);
    expect(unitAllowsLogin(undefined)).toBe(true);
    expect(unitAllowsLogin("")).toBe(true);
  });

  it("NO_LOGIN_UNITS ne contient exactement que Farfadets et Louveteaux", () => {
    expect(NO_LOGIN_UNITS).toEqual(["FARFADETS", "LOUVETEAUX"]);
  });
});
