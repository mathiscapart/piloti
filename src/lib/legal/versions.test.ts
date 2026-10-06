// #154 — un identifiant de version peut porter un suffixe de révision
// (« 2026-09-21.3 ») pour rester unique dans `Consent.privacyVersion` ; les
// pages légales n'en affichent que la date.

import { describe, expect, it } from "vitest";

import { PRIVACY_VERSION, legalVersionDate } from "./versions";

describe("legalVersionDate", () => {
  it("retire le suffixe de révision", () => {
    expect(legalVersionDate("2026-09-21.3")).toBe("2026-09-21");
  });

  it("laisse intacte une version sans suffixe", () => {
    expect(legalVersionDate("2026-08-22")).toBe("2026-08-22");
  });

  it("affiche la version courante de la politique comme une date", () => {
    expect(legalVersionDate(PRIVACY_VERSION)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
