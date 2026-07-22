// Tests de src/modules/communication/dm-policy.ts — règle SAFE-01 de
// protection des mineurs dans la messagerie privée. On verrouille ici la
// matrice complète (âges, chef d'unité, lien familial, profil incomplet) et
// la symétrie de la décision : le verdict ne doit jamais dépendre de qui
// initie l'échange.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateDmPolicy, type DmParticipant } from "./dm-policy";

// Date locale (mois 1-indexé), figée par `vi.setSystemTime` dans chaque test
// pour que les âges calculés soient déterministes.
function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

// "Aujourd'hui" fixé au 15 juin 2024 pour toute la suite : permet de choisir
// des dates de naissance qui donnent des âges ronds et lisibles.
const TODAY = d(2024, 6, 15);

function child(overrides: Partial<DmParticipant> = {}): DmParticipant {
  return { roles: ["SCOUT"], unit: "LOUVETEAUX", birthDate: d(2015, 6, 15), ...overrides }; // 9 ans
}

function teen(overrides: Partial<DmParticipant> = {}): DmParticipant {
  return { roles: ["SCOUT"], unit: "PIONNIERS", birthDate: d(2008, 6, 15), ...overrides }; // 16 ans
}

function chief(unit: string, overrides: Partial<DmParticipant> = {}): DmParticipant {
  return { roles: ["CHEF"], unit, birthDate: d(1990, 6, 15), ...overrides }; // 34 ans
}

function adult(overrides: Partial<DmParticipant> = {}): DmParticipant {
  return { roles: ["PARENT"], unit: "ADULTES", birthDate: d(1990, 6, 15), ...overrides }; // 34 ans
}

function admin(overrides: Partial<DmParticipant> = {}): DmParticipant {
  return { roles: ["ADMIN"], unit: null, birthDate: d(1990, 6, 15), ...overrides }; // 34 ans
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

describe("moins de 15 ans — aucun échange privé, dans aucun sens", () => {
  it("bloque quand le jeune de moins de 15 ans est l'émetteur", () => {
    const verdict = evaluateDmPolicy(child(), adult(), false);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/moins de 15 ans/i);
  });

  it("bloque quand le jeune de moins de 15 ans est le destinataire", () => {
    const verdict = evaluateDmPolicy(adult(), child(), false);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/moins de 15 ans/i);
  });

  it("bloque même face à un chef de la même unité (l'unité n'entre pas en jeu avant 15 ans)", () => {
    const verdict = evaluateDmPolicy(child({ unit: "LOUVETEAUX" }), chief("LOUVETEAUX"), false);
    expect(verdict.allowed).toBe(false);
  });
});

describe("15-17 ans — uniquement les chefs de son unité", () => {
  it("autorise un jeune avec un chef de sa propre unité", () => {
    const t = teen({ unit: "PIONNIERS" });
    const c = chief("PIONNIERS");
    expect(evaluateDmPolicy(t, c, false).allowed).toBe(true);
    expect(evaluateDmPolicy(c, t, false).allowed).toBe(true); // symétrie
  });

  it("refuse un jeune avec un chef d'une autre unité", () => {
    const t = teen({ unit: "PIONNIERS" });
    const c = chief("COMPAGNONS");
    const v1 = evaluateDmPolicy(t, c, false);
    const v2 = evaluateDmPolicy(c, t, false);
    expect(v1.allowed).toBe(false);
    expect(v2.allowed).toBe(false);
  });

  it("refuse un jeune sans unité renseignée, même face à un chef (fail-safe)", () => {
    const t = teen({ unit: null });
    const c = chief("PIONNIERS");
    expect(evaluateDmPolicy(t, c, false).allowed).toBe(false);
    expect(evaluateDmPolicy(c, t, false).allowed).toBe(false);
  });

  it("refuse un jeune avec un adulte de la même unité qui n'est pas chef", () => {
    const t = teen({ unit: "PIONNIERS" });
    const a = adult({ unit: "PIONNIERS" });
    expect(evaluateDmPolicy(t, a, false).allowed).toBe(false);
  });

  it("refuse deux jeunes de 15-17 ans entre eux", () => {
    const t1 = teen({ unit: "PIONNIERS" });
    const t2 = teen({ unit: "COMPAGNONS" });
    expect(evaluateDmPolicy(t1, t2, false).allowed).toBe(false);
    expect(evaluateDmPolicy(t2, t1, false).allowed).toBe(false);
  });
});

describe("adultes entre eux — libre", () => {
  it("autorise deux adultes sans lien particulier", () => {
    expect(evaluateDmPolicy(adult(), adult({ roles: ["CHEF"] }), false).allowed).toBe(true);
  });
});

describe("lien familial — toujours autorisé, quel que soit l'âge", () => {
  it("autorise un parent et son enfant de moins de 15 ans", () => {
    expect(evaluateDmPolicy(adult(), child(), true).allowed).toBe(true);
    expect(evaluateDmPolicy(child(), adult(), true).allowed).toBe(true);
  });

  it("autorise un jeune de 15-17 ans avec un parent qui n'est pas chef de son unité", () => {
    const t = teen({ unit: "PIONNIERS" });
    const a = adult({ unit: "ADULTES" });
    expect(evaluateDmPolicy(t, a, true).allowed).toBe(true);
    expect(evaluateDmPolicy(a, t, true).allowed).toBe(true);
  });
});

describe("date de naissance absente — profil incomplet, pas « protection des mineurs »", () => {
  it("bloque et distingue le message quand c'est mon propre profil qui est incomplet", () => {
    const verdict = evaluateDmPolicy(adult({ birthDate: null }), adult(), false);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/profil/i);
    expect(verdict.reason).not.toMatch(/mineur/i);
  });

  it("bloque et distingue le message quand c'est le profil de l'autre qui est incomplet", () => {
    const verdict = evaluateDmPolicy(adult(), adult({ birthDate: null }), false);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/profil/i);
    expect(verdict.reason).not.toMatch(/mineur/i);
  });

  it("bloque quand les deux profils sont incomplets", () => {
    const verdict = evaluateDmPolicy(adult({ birthDate: null }), adult({ birthDate: undefined }), false);
    expect(verdict.allowed).toBe(false);
  });

  it("le lien familial ne contourne pas le profil incomplet fail-safe... sauf qu'il le fait explicitement", () => {
    // Le lien familial est un court-circuit total (toujours autorisé), y
    // compris avec une date de naissance manquante d'un côté.
    const verdict = evaluateDmPolicy(adult({ birthDate: null }), adult(), true);
    expect(verdict.allowed).toBe(true);
  });
});

describe("ADMIN — passe-droit dans les deux sens", () => {
  it("autorise un ADMIN à écrire à un enfant de moins de 15 ans", () => {
    expect(evaluateDmPolicy(admin(), child(), false).allowed).toBe(true);
    expect(evaluateDmPolicy(child(), admin(), false).allowed).toBe(true);
  });

  it("autorise un ADMIN avec un jeune de 15-17 ans hors de son unité", () => {
    const t = teen({ unit: "PIONNIERS" });
    expect(evaluateDmPolicy(admin(), t, false).allowed).toBe(true);
    expect(evaluateDmPolicy(t, admin(), false).allowed).toBe(true);
  });

  it("passe outre un profil incomplet côté ADMIN comme côté membre", () => {
    expect(evaluateDmPolicy(admin({ birthDate: null }), child(), false).allowed).toBe(true);
    expect(evaluateDmPolicy(adult(), admin({ birthDate: null }), false).allowed).toBe(true);
  });

  it("s'applique même sans unité renseignée (le cas qui reste bloqué pour un simple chef)", () => {
    const t = teen({ unit: null });
    expect(evaluateDmPolicy(admin({ unit: null }), t, false).allowed).toBe(true);
  });
});

describe("symétrie de la décision", () => {
  const cases: Array<[string, DmParticipant, DmParticipant, boolean]> = [
    ["deux adultes", adult(), adult({ roles: ["CHEF"] }), false],
    ["jeune + chef de son unité", teen({ unit: "SCOUTS" }), chief("SCOUTS"), false],
    ["jeune + chef d'une autre unité", teen({ unit: "SCOUTS" }), chief("FARFADETS"), false],
    ["deux jeunes de 15-17 ans", teen({ unit: "SCOUTS" }), teen({ unit: "PIONNIERS" }), false],
    ["enfant + adulte", child(), adult(), false],
    ["enfant + jeune de 15-17 ans", child(), teen(), false],
    ["profil incomplet + adulte", adult({ birthDate: null }), adult(), false],
    ["lien familial, enfant + adulte", child(), adult(), true],
  ];

  it.each(cases)("verdict identique dans les deux sens : %s", (_label, a, b, familyLinked) => {
    const direct = evaluateDmPolicy(a, b, familyLinked);
    const reverse = evaluateDmPolicy(b, a, familyLinked);
    expect(reverse.allowed).toBe(direct.allowed);
  });
});
