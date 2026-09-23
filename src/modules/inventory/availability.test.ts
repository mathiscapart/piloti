// Tests de src/modules/inventory/availability.ts — quantité disponible d'un
// article sur une période de prêt (US-12, issue #73). Une erreur ici autorise
// une double réservation d'un article qui n'est physiquement pas au local.

import { describe, expect, it } from "vitest";
import { availableQtyForPeriod, blockingLoans, isOverdue } from "./availability";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date("2026-09-11T10:00:00.000Z");
const PERIOD = { start: d("2026-09-11"), end: d("2026-09-18") };

// Le statut n'intervient pas ici : l'appelant ne passe que les prêts actifs
// (ACTIF / RETARD / SECHAGE), filtrés en amont par la requête Prisma.
const loan = (startDate: string, expectedReturn: string, quantity = 1) => ({
  startDate: d(startDate),
  expectedReturn: d(expectedReturn),
  quantity,
});

describe("availableQtyForPeriod", () => {
  it("aucun prêt → tout le stock est disponible", () => {
    expect(availableQtyForPeriod(3, [], PERIOD, NOW)).toBe(3);
  });

  it("prêt en cours qui chevauche la période → consomme le stock", () => {
    const loans = [loan("2026-09-10", "2026-09-14")];
    expect(availableQtyForPeriod(1, loans, PERIOD, NOW)).toBe(0);
  });

  it("prêt futur qui se termine avant la période → ne consomme rien", () => {
    const loans = [loan("2026-09-12", "2026-09-13")];
    const period = { start: d("2026-09-20"), end: d("2026-09-25") };
    expect(availableQtyForPeriod(1, loans, period, NOW)).toBe(1);
  });

  it("prêt qui commence après la période → ne consomme rien", () => {
    const loans = [loan("2026-09-20", "2026-09-25")];
    expect(availableQtyForPeriod(1, loans, PERIOD, NOW)).toBe(1);
  });

  it("prêt en retard non rendu → bloque la période (cas de l'issue #73)", () => {
    const loans = [loan("2026-09-01", "2026-09-07")];
    expect(availableQtyForPeriod(1, loans, PERIOD, NOW)).toBe(0);
  });

  it("prêt en retard → bloque indéfiniment, même une période lointaine", () => {
    const loans = [loan("2026-09-01", "2026-09-07")];
    const period = { start: d("2027-01-01"), end: d("2027-01-05") };
    expect(availableQtyForPeriod(1, loans, period, NOW)).toBe(0);
  });

  it("prêt dû aujourd'hui → pas encore en retard, ne bloque pas demain", () => {
    const loans = [loan("2026-09-05", "2026-09-11")];
    const period = { start: d("2026-09-12"), end: d("2026-09-14") };
    expect(availableQtyForPeriod(1, loans, period, NOW)).toBe(1);
  });

  it("prêt dû hier et non rendu → en retard, bloque", () => {
    const loans = [loan("2026-09-05", "2026-09-10")];
    const period = { start: d("2026-09-12"), end: d("2026-09-14") };
    expect(availableQtyForPeriod(1, loans, period, NOW)).toBe(0);
  });

  it("quantités partielles : on soustrait les prêts qui chevauchent", () => {
    const loans = [
      loan("2026-09-10", "2026-09-12", 2), // chevauche
      loan("2026-09-01", "2026-09-05", 1), // en retard → chevauche
      loan("2026-09-20", "2026-09-22", 3), // après → ignoré
    ];
    expect(availableQtyForPeriod(5, loans, PERIOD, NOW)).toBe(2);
  });

  it("jamais négatif quand les prêts dépassent le stock", () => {
    const loans = [loan("2026-09-10", "2026-09-12", 4)];
    expect(availableQtyForPeriod(2, loans, PERIOD, NOW)).toBe(0);
  });

  it("bornes inclusives : un retour prévu le jour du départ chevauche", () => {
    const loans = [loan("2026-09-12", "2026-09-20")];
    const period = { start: d("2026-09-20"), end: d("2026-09-22") };
    expect(availableQtyForPeriod(1, loans, period, NOW)).toBe(0);
  });
});

describe("isOverdue", () => {
  it("en retard seulement une fois la journée de retour prévue écoulée", () => {
    expect(isOverdue(loan("2026-09-05", "2026-09-11"), NOW)).toBe(false);
    expect(isOverdue(loan("2026-09-05", "2026-09-10"), NOW)).toBe(true);
  });
});

describe("blockingLoans", () => {
  it("renvoie les prêts bloquants en conservant leurs champs", () => {
    const late = { ...loan("2026-09-01", "2026-09-07"), borrower: "Thomas Martin" };
    const after = { ...loan("2026-09-20", "2026-09-22"), borrower: "Autre" };
    expect(blockingLoans([late, after], PERIOD, NOW)).toEqual([late]);
  });
});
