// Tests de src/modules/finance/collection.ts — agrégats d'encaissement d'une
// campagne ou d'un événement (#121). Le reste dû se calcule jeune par jeune :
// un trop-perçu chez l'un ne doit jamais masquer ce que doivent les autres.

import { describe, expect, it } from "vitest";
import { overpaymentCents, summarizeCollection } from "./collection";

describe("summarizeCollection", () => {
  it("un trop-perçu d'un jeune ne masque pas le reste des autres", () => {
    const lines = [
      { expectedCents: 1250, paidCents: 11250 },
      { expectedCents: 1250, paidCents: 0 },
      { expectedCents: 1250, paidCents: 0 },
      { expectedCents: 1250, paidCents: 0 },
    ];
    expect(summarizeCollection(lines)).toEqual({
      collectedCents: 11250,
      expectedCents: 5000,
      remainingCents: 3750,
      overpaidCents: 10000,
      pct: 25,
    });
  });

  it("un jeune à 0 € attendu n'entre pas dans le reste", () => {
    const lines = [
      { expectedCents: 0, paidCents: 0 },
      { expectedCents: 1000, paidCents: 400 },
    ];
    const s = summarizeCollection(lines);
    expect(s.remainingCents).toBe(600);
    expect(s.overpaidCents).toBe(0);
    expect(s.pct).toBe(40);
  });

  it("le pourcentage ne dépasse jamais 100 %", () => {
    const s = summarizeCollection([{ expectedCents: 1000, paidCents: 5000 }]);
    expect(s.pct).toBe(100);
    expect(s.remainingCents).toBe(0);
    expect(s.overpaidCents).toBe(4000);
  });

  it("aucune ligne → tout à zéro", () => {
    expect(summarizeCollection([])).toEqual({
      collectedCents: 0,
      expectedCents: 0,
      remainingCents: 0,
      overpaidCents: 0,
      pct: 0,
    });
  });
});

describe("overpaymentCents", () => {
  it("paiement égal au reste dû → pas de trop-perçu", () => {
    expect(overpaymentCents(1250, 500, 750)).toBe(0);
  });

  it("paiement au-delà du reste dû → l'excédent", () => {
    expect(overpaymentCents(1250, 1250, 10000)).toBe(10000);
    expect(overpaymentCents(1550, 500, 10000)).toBe(8950);
  });

  it("jeune déjà en trop-perçu → seul le nouveau montant compte", () => {
    expect(overpaymentCents(1000, 1500, 200)).toBe(200);
  });
});
