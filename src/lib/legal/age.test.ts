// Tests de src/lib/legal/age.ts — module fail-safe critique pour la protection
// des mineurs (SAFE-01) et le consentement parental (RGPD-02). On verrouille
// ici les bornes exactes de calcul d'âge et le comportement sur date absente
// ou invalide : c'est la garantie anti-contournement du module.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRECT_MESSAGE_MIN_AGE,
  MAJORITY_AGE,
  MAX_PLAUSIBLE_AGE,
  MIN_PLAUSIBLE_AGE,
  PARENTAL_CONSENT_AGE,
  birthDateSchema,
  canUseDirectMessages,
  computeAge,
  isAdult,
  isMinor,
  requiresParentalConsent,
} from "./age";

// Date locale (mois 1-indexé, plus lisible qu'un `new Date(y, m, d)` classique).
function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

// Équivalent en `string` de `d()`, avec heure explicite pour éviter que le
// parsing ISO (`new Date("YYYY-MM-DD")`, interprété en UTC) ne fasse glisser
// la date d'un jour selon le fuseau horaire de la machine qui exécute le test.
function iso(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T00:00:00`;
}

function setToday(year: number, month: number, day: number): void {
  vi.setSystemTime(d(year, month, day));
}

describe("age — seuils", () => {
  it("expose les trois seuils attendus", () => {
    expect(PARENTAL_CONSENT_AGE).toBe(15);
    expect(DIRECT_MESSAGE_MIN_AGE).toBe(15);
    expect(MAJORITY_AGE).toBe(18);
  });
});

describe("computeAge — bornes exactes", () => {
  beforeEach(() => vi.useFakeTimers());

  it("la veille de l'anniversaire, l'âge n'est pas encore atteint", () => {
    setToday(2024, 6, 14);
    expect(computeAge(d(2010, 6, 15))).toBe(13);
  });

  it("le jour de l'anniversaire, l'âge est déjà atteint", () => {
    setToday(2024, 6, 15);
    expect(computeAge(d(2010, 6, 15))).toBe(14);
  });

  it("le lendemain de l'anniversaire, l'âge reste atteint", () => {
    setToday(2024, 6, 16);
    expect(computeAge(d(2010, 6, 15))).toBe(14);
  });

  it("gère un anniversaire le 29 février (année bissextile → année bissextile)", () => {
    setToday(2024, 2, 29);
    expect(computeAge(d(2008, 2, 29))).toBe(16);
  });

  it("un anniversaire le 29 février est bien passé au 1er mars d'une année non bissextile", () => {
    setToday(2023, 3, 1);
    expect(computeAge(d(2008, 2, 29))).toBe(15);
  });

  it("accepte une date de naissance en `string` comme en `Date`", () => {
    setToday(2024, 6, 15);
    expect(computeAge(iso(2010, 6, 15))).toBe(14);
  });

  it("une date de naissance dans le futur donne un âge négatif (aucune garde ad hoc)", () => {
    setToday(2024, 6, 15);
    expect(computeAge(d(2030, 1, 1))).toBeLessThan(0);
  });
});

describe("computeAge — fail-safe sur date absente ou invalide", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["chaîne vide", ""],
    ["chaîne invalide", "pas-une-date"],
    ["Date invalide", new Date("invalid")],
  ])("renvoie null pour %s", (_label, value) => {
    expect(computeAge(value)).toBeNull();
  });
});

describe("requiresParentalConsent (RGPD-02, seuil 15 ans)", () => {
  beforeEach(() => vi.useFakeTimers());

  it("requiert un consentement parental en-dessous de 15 ans", () => {
    setToday(2024, 6, 15);
    expect(requiresParentalConsent(d(2010, 6, 16))).toBe(true); // 13 ans
  });

  it("ne requiert plus de consentement parental à 15 ans pile", () => {
    setToday(2024, 6, 15);
    expect(requiresParentalConsent(d(2009, 6, 15))).toBe(false); // 15 ans jour J
  });

  it("renvoie false (fail-safe) sur date inconnue", () => {
    expect(requiresParentalConsent(null)).toBe(false);
    expect(requiresParentalConsent(undefined)).toBe(false);
    expect(requiresParentalConsent("")).toBe(false);
  });
});

describe("isAdult / isMinor (SAFE-01, seuil 18 ans)", () => {
  beforeEach(() => vi.useFakeTimers());

  it("n'est pas encore adulte à 17 ans", () => {
    setToday(2024, 6, 15);
    expect(isAdult(d(2006, 6, 16))).toBe(false);
    expect(isMinor(d(2006, 6, 16))).toBe(true);
  });

  it("est adulte à 18 ans pile", () => {
    setToday(2024, 6, 15);
    expect(isAdult(d(2006, 6, 15))).toBe(true);
    expect(isMinor(d(2006, 6, 15))).toBe(false);
  });

  it("isAdult renvoie false sur date inconnue — jamais adulte par défaut", () => {
    expect(isAdult(null)).toBe(false);
    expect(isAdult(undefined)).toBe(false);
    expect(isAdult("")).toBe(false);
    expect(isAdult("pas-une-date")).toBe(false);
  });

  it("isMinor renvoie true sur date inconnue — protège par défaut", () => {
    expect(isMinor(null)).toBe(true);
    expect(isMinor(undefined)).toBe(true);
    expect(isMinor("")).toBe(true);
    expect(isMinor("pas-une-date")).toBe(true);
  });

  it("une date de naissance dans le futur n'accorde jamais la majorité", () => {
    setToday(2024, 6, 15);
    expect(isAdult(d(2030, 1, 1))).toBe(false);
    expect(isMinor(d(2030, 1, 1))).toBe(true);
  });
});

describe("canUseDirectMessages (SAFE-01, seuil 15 ans)", () => {
  beforeEach(() => vi.useFakeTimers());

  it("refuse la messagerie privée en-dessous de 15 ans", () => {
    setToday(2024, 6, 15);
    expect(canUseDirectMessages(d(2010, 6, 16))).toBe(false); // 13 ans
  });

  it("autorise la messagerie privée à 15 ans pile", () => {
    setToday(2024, 6, 15);
    expect(canUseDirectMessages(d(2009, 6, 15))).toBe(true);
  });

  it("refuse (fail-safe) sur date inconnue — aucun droit sur une date manquante", () => {
    expect(canUseDirectMessages(null)).toBe(false);
    expect(canUseDirectMessages(undefined)).toBe(false);
    expect(canUseDirectMessages("")).toBe(false);
    expect(canUseDirectMessages("pas-une-date")).toBe(false);
  });
});

// SAFE-01 — la date est déclarative, mais elle doit rester crédible : « 1900 »
// suffisait à un jeune pour se déclarer majeur et débloquer la messagerie
// privée, et une date à quelques mois passait sans broncher.
describe("birthDateSchema — bornes de plausibilité", () => {
  beforeEach(() => vi.useFakeTimers());

  it("expose les bornes attendues", () => {
    expect(MIN_PLAUSIBLE_AGE).toBe(5);
    expect(MAX_PLAUSIBLE_AGE).toBe(110);
  });

  it("accepte un âge plausible (jeune comme adulte)", () => {
    setToday(2026, 8, 8);
    expect(birthDateSchema.safeParse(iso(2013, 6, 1)).success).toBe(true);
    expect(birthDateSchema.safeParse(iso(1985, 4, 12)).success).toBe(true);
  });

  it("accepte exactement les bornes", () => {
    setToday(2026, 8, 8);
    expect(birthDateSchema.safeParse(iso(2021, 8, 8)).success).toBe(true); // 5 ans pile
    expect(birthDateSchema.safeParse(iso(1916, 8, 8)).success).toBe(true); // 110 ans pile
  });

  it("rejette un âge sous la borne basse (saisie à quelques mois)", () => {
    setToday(2026, 8, 8);
    expect(birthDateSchema.safeParse(iso(2026, 4, 6)).success).toBe(false);
    expect(birthDateSchema.safeParse(iso(2021, 8, 9)).success).toBe(false); // 4 ans
  });

  it("rejette un âge au-dessus de la borne haute — le sens dangereux", () => {
    setToday(2026, 8, 8);
    // Sans cette borne, un mineur se déclarait majeur et débloquait les DM.
    expect(birthDateSchema.safeParse(iso(1900, 1, 1)).success).toBe(false);
    expect(birthDateSchema.safeParse(iso(1915, 8, 8)).success).toBe(false); // 111 ans
  });

  it("rejette une date dans le futur", () => {
    setToday(2026, 8, 8);
    expect(birthDateSchema.safeParse(iso(2030, 1, 1)).success).toBe(false);
  });

  it("rejette une date invalide", () => {
    expect(birthDateSchema.safeParse("pas-une-date").success).toBe(false);
    expect(birthDateSchema.safeParse("").success).toBe(false);
  });

  // Le contrôle « pas dans le futur » est un `refine`, donc évalué à chaque
  // validation : un `.max(new Date())` aurait figé « maintenant » au
  // chargement du module et dérivé sur un serveur qui tourne longtemps.
  it("évalue « aujourd'hui » à la validation, pas au chargement du module", () => {
    setToday(2026, 8, 8);
    expect(birthDateSchema.safeParse(iso(2021, 8, 8)).success).toBe(true);
    // Dix ans plus tard, la même date de naissance reste valide (15 ans)…
    setToday(2036, 8, 8);
    expect(birthDateSchema.safeParse(iso(2021, 8, 8)).success).toBe(true);
    // …et une date née entre-temps devient acceptable, ce qu'une borne figée
    // au chargement du module aurait continué de refuser comme « future ».
    expect(birthDateSchema.safeParse(iso(2030, 1, 1)).success).toBe(true);
  });
});

// Chaque suite qui manipule "aujourd'hui" active ses propres faux timers
// (`beforeEach`) ; on les désactive systématiquement après chaque test pour ne
// jamais faire fuiter une date figée vers un test qui n'en a pas besoin.
afterEach(() => {
  vi.useRealTimers();
});
