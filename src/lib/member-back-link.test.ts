import { describe, expect, it } from "vitest";

import { memberBackLink } from "./member-back-link";

describe("memberBackLink (#80)", () => {
  it("revient à la liste des membres par défaut", () => {
    expect(memberBackLink(undefined)).toEqual({
      from: null,
      href: "/membres",
      label: "Retour aux membres",
    });
  });

  it.each([
    ["prets", "/prets", "Retour aux prêts"],
    ["annuaire", "/membres/annuaire", "Retour à l'annuaire"],
    ["presences", "/planning/presences", "Retour aux présences"],
  ])("from=%s → %s", (from, href, label) => {
    expect(memberBackLink(from)).toEqual({ from, href, label });
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/admin",
    "PRETS",
    "toString",
    "__proto__",
    "",
  ])("une valeur hors liste blanche (%j) retombe sur /membres", (from) => {
    expect(memberBackLink(from).href).toBe("/membres");
  });

  it("ignore un paramètre répété (tableau)", () => {
    expect(memberBackLink(["prets", "annuaire"]).href).toBe("/membres");
  });
});
