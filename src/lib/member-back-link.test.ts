import { describe, expect, it } from "vitest";

import {
  memberBackLink,
  memberBackQuery,
  memberProfileRedirect,
} from "./member-back-link";

const FALLBACK = {
  from: null,
  href: "/membres",
  label: "Retour aux membres",
};

const KEYS = ["prets", "annuaire", "presences", "dashboard"] as const;

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
    ["dashboard", "/dashboard", "Retour au tableau de bord"],
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

  it.each([
    "inconnu",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "",
    "PRETS",
    "Annuaire",
    " prets",
    "prets ",
    "prets?x=1",
    "prets/../admin",
  ])("la valeur hostile %j donne le repli complet", (from) => {
    expect(memberBackLink(from)).toEqual(FALLBACK);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["un nombre", 1],
    ["un tableau à un élément", ["prets"]],
    ["un tableau à deux éléments", ["prets", "annuaire"]],
    ["un objet", { prets: true }],
    ["un File", new File(["x"], "prets")],
    ["un Blob", new Blob(["prets"])],
  ])("le non-texte (%s) donne le repli complet", (_nom, from) => {
    expect(memberBackLink(from)).toEqual(FALLBACK);
  });
});

describe("memberBackQuery (#80)", () => {
  it("renvoie une chaîne vide sans origine", () => {
    expect(memberBackQuery(null)).toBe("");
  });

  it.each(KEYS)("from=%s → ?from=%s", (from) => {
    expect(memberBackQuery(from)).toBe(`?from=${from}`);
  });
});

describe("memberProfileRedirect (#66)", () => {
  it.each([
    ["prets", "/prets"],
    ["annuaire", "/membres/annuaire"],
    ["presences", "/planning/presences"],
    ["dashboard", "/dashboard"],
  ])("from=%s → %s?notice=member-profile-updated", (from, href) => {
    expect(memberProfileRedirect(from)).toBe(
      `${href}?notice=member-profile-updated`,
    );
  });

  it.each([
    ["https://evil.com"],
    ["//evil.com"],
    ["__proto__"],
    [["prets"]],
    [null],
    [undefined],
  ])("la valeur hostile %j retombe sur /membres", (from) => {
    expect(memberProfileRedirect(from)).toBe(
      "/membres?notice=member-profile-updated",
    );
  });

  it("commence toujours par un seul « / » suivi d'un autre caractère que « / » ou « \\ »", () => {
    const entrees: unknown[] = [
      ...KEYS,
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "\\evil.com",
      "javascript:alert(1)",
      "__proto__",
      "constructor",
      "",
      null,
      undefined,
      42,
      ["prets"],
      {},
    ];
    for (const from of entrees) {
      expect(memberProfileRedirect(from)).toMatch(/^\/[^/\\]/);
    }
  });
});
