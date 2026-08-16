// Tests de src/modules/finance/format.ts — parsing de montants saisis en euros
// vers des centimes (entier), utilisé partout où un utilisateur saisit un prix
// (notes de frais, cotisations, budget d'événement). Une erreur de parsing ici
// se traduit directement par un montant faux en base.

import { describe, expect, it } from "vitest";
import { formatEuros, parseAmountToCents } from "./format";

describe("parseAmountToCents", () => {
  it("parse un entier", () => {
    expect(parseAmountToCents("60")).toBe(6000);
  });

  it("parse une virgule française", () => {
    expect(parseAmountToCents("60,50")).toBe(6050);
  });

  it("parse un point décimal", () => {
    expect(parseAmountToCents("60.5")).toBe(6050);
  });

  it("ignore les espaces, y compris un séparateur de milliers", () => {
    expect(parseAmountToCents(" 1 000,50 ")).toBe(100050);
  });

  it("arrondit les imprécisions de flottant (19.99 € → 1999 centimes pile)", () => {
    expect(parseAmountToCents("19.99")).toBe(1999);
  });

  it("rejette zéro (aucun montant positif)", () => {
    expect(parseAmountToCents("0")).toBeNull();
  });

  it("rejette un montant négatif", () => {
    expect(parseAmountToCents("-5")).toBeNull();
  });

  it("rejette plus de deux décimales", () => {
    expect(parseAmountToCents("60,555")).toBeNull();
  });

  it("rejette une chaîne vide ou uniquement des espaces", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("   ")).toBeNull();
  });

  it("rejette une saisie non numérique", () => {
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("rejette un point décimal sans chiffre derrière", () => {
    expect(parseAmountToCents("60.")).toBeNull();
  });

  it("accepte le plafond exact (1 000 000 €)", () => {
    expect(parseAmountToCents("1000000")).toBe(100_000_000);
  });

  it("rejette un montant au-delà du plafond (faute de frappe probable : un zéro en trop)", () => {
    expect(parseAmountToCents("10000000")).toBeNull();
  });

  it("rejette un montant très largement au-delà du plafond", () => {
    expect(parseAmountToCents("999999999")).toBeNull();
  });
});

describe("formatEuros", () => {
  it("formate des centimes en euros au format fr-FR", () => {
    expect(formatEuros(6050)).toMatch(/60,50\s?€/);
  });

  it("formate zéro", () => {
    expect(formatEuros(0)).toMatch(/0,00\s?€/);
  });

  it("formate un montant négatif", () => {
    expect(formatEuros(-500)).toMatch(/-5,00\s?€/);
  });
});
