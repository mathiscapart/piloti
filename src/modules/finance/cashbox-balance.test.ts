// Tests de src/modules/finance/cashbox-balance.ts — garde de solde d'une caisse
// (#105). Une caisse d'espèces ne peut pas passer en négatif : un retrait ou un
// transfert sortant supérieur au solde est refusé. Une erreur ici laisse une
// caisse afficher un solde physiquement impossible.

import { describe, expect, it } from "vitest";
import { canWithdraw, insufficientBalanceMessage } from "./cashbox-balance";

describe("canWithdraw", () => {
  it("refuse un retrait supérieur au solde (100 € dispo, 250 € demandés)", () => {
    expect(canWithdraw(10000, 25000)).toBe(false);
  });

  it("accepte un retrait égal au solde (la caisse tombe à 0)", () => {
    expect(canWithdraw(10000, 10000)).toBe(true);
  });

  it("accepte un retrait inférieur au solde", () => {
    expect(canWithdraw(10000, 9999)).toBe(true);
  });

  it("refuse un centime de trop", () => {
    expect(canWithdraw(10000, 10001)).toBe(false);
  });

  it("refuse tout retrait sur une caisse vide", () => {
    expect(canWithdraw(0, 1)).toBe(false);
  });

  it("refuse tout retrait sur une caisse déjà négative (données antérieures)", () => {
    expect(canWithdraw(-15000, 1)).toBe(false);
  });

  it("tient à la borne haute de parseAmountToCents (1 000 000 €)", () => {
    expect(canWithdraw(100_000_000, 100_000_000)).toBe(true);
    expect(canWithdraw(99_999_999, 100_000_000)).toBe(false);
  });
});

describe("insufficientBalanceMessage", () => {
  it("donne le solde disponible en euros, format français", () => {
    // L'espace avant « € » est insécable ; laquelle (U+00A0, U+202F) dépend
    // de la version d'ICU de Node.
    expect(insufficientBalanceMessage(10000)).toMatch(
      /^Solde insuffisant : 100,00\s€ disponibles\.$/,
    );
  });

  it("donne 0,00 € pour une caisse vide", () => {
    expect(insufficientBalanceMessage(0)).toMatch(
      /^Solde insuffisant : 0,00\s€ disponibles\.$/,
    );
  });

  it("affiche le solde négatif tel quel pour une caisse déjà à découvert (données antérieures)", () => {
    expect(insufficientBalanceMessage(-15000)).toMatch(
      /^Solde insuffisant : -150,00\s€ disponibles\.$/,
    );
  });

  it("garde les centimes (1 centime disponible)", () => {
    expect(insufficientBalanceMessage(1)).toMatch(
      /^Solde insuffisant : 0,01\s€ disponibles\.$/,
    );
  });
});
