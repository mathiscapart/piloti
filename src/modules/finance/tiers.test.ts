// Tests de src/modules/finance/tiers.ts — répartition des tarifs différenciés
// d'une campagne de cotisation (US-F01) entre tarif plein, 2e enfant et « cas
// social », pondérée par la tranche de quotient familial. Logique pure qui
// manipule directement des montants dus : une erreur ici facture le mauvais
// tarif à une famille.

import { describe, expect, it } from "vitest";
import { computeTiers, type TierCampaign } from "./tiers";

const campaign: TierCampaign = {
  amountCents: 10000,
  secondChildCents: 6000,
  socialCents: 3000,
};

describe("computeTiers — tarif plein / 2e enfant", () => {
  it("enfant unique sans lien familial → tarif plein (FIRST)", () => {
    const out = computeTiers(campaign, ["a1"], [], new Set());
    expect(out.get("a1")).toEqual({ expectedCents: 10000, tier: "FIRST" });
  });

  it("deux enfants d'un même parent : le tarif 2e enfant s'applique à l'un des deux", () => {
    const links = [
      { parentId: "p1", childId: "a1" },
      { parentId: "p1", childId: "b1" },
    ];
    const out = computeTiers(campaign, ["a1", "b1"], links, new Set());
    // NB : le départage FIRST/SECOND est fait par tri alphabétique des id, pas
    // par date de naissance — voir la remarque transmise à l'équipe. On
    // verrouille ici le comportement réel, pas un ordre "souhaitable".
    expect(out.get("a1")).toEqual({ expectedCents: 10000, tier: "FIRST" });
    expect(out.get("b1")).toEqual({ expectedCents: 6000, tier: "SECOND" });
  });

  it("au-delà du 2e enfant, chacun des suivants reste au tarif SECOND (pas de 3e palier)", () => {
    const links = [
      { parentId: "p1", childId: "a1" },
      { parentId: "p1", childId: "b1" },
      { parentId: "p1", childId: "c1" },
    ];
    const out = computeTiers(campaign, ["a1", "b1", "c1"], links, new Set());
    expect(out.get("a1")?.tier).toBe("FIRST");
    expect(out.get("b1")?.tier).toBe("SECOND");
    expect(out.get("c1")?.tier).toBe("SECOND");
  });

  it("secondChildCents absent (null) → retombe sur le tarif plein pour le 2e enfant", () => {
    const camp: TierCampaign = { ...campaign, secondChildCents: null };
    const links = [
      { parentId: "p1", childId: "a1" },
      { parentId: "p1", childId: "b1" },
    ];
    const out = computeTiers(camp, ["a1", "b1"], links, new Set());
    expect(out.get("b1")).toEqual({ expectedCents: 10000, tier: "SECOND" });
  });

  it("un frère/sœur hors du périmètre de la campagne n'est pas compté", () => {
    const links = [
      { parentId: "p1", childId: "a1" },
      { parentId: "p1", childId: "b1" }, // absent de jeuneIds : hors campagne
    ];
    const out = computeTiers(campaign, ["a1"], links, new Set());
    expect(out.get("a1")).toEqual({ expectedCents: 10000, tier: "FIRST" });
  });

  it("plusieurs parents pour les mêmes enfants : la fratrie est l'union, sans doublon", () => {
    const links = [
      { parentId: "p1", childId: "a1" },
      { parentId: "p2", childId: "a1" },
      { parentId: "p1", childId: "b1" },
      { parentId: "p2", childId: "b1" },
    ];
    const out = computeTiers(campaign, ["a1", "b1"], links, new Set());
    expect(out.get("a1")?.tier).toBe("FIRST");
    expect(out.get("b1")?.tier).toBe("SECOND");
  });
});

describe("computeTiers — cas social", () => {
  it("montant pinné, jamais pondéré par la tranche, même en fratrie", () => {
    const links = [
      { parentId: "p1", childId: "a1" },
      { parentId: "p1", childId: "b1" },
    ];
    const permilleByUser = new Map([
      ["a1", 500],
      ["b1", 500],
    ]);
    const out = computeTiers(campaign, ["a1", "b1"], links, new Set(["a1"]), permilleByUser);
    expect(out.get("a1")).toEqual({ expectedCents: 3000, tier: "SOCIAL" });
  });

  it("socialCents absent (null) → retombe sur amountCents", () => {
    const camp: TierCampaign = { ...campaign, socialCents: null };
    const out = computeTiers(camp, ["a1"], [], new Set(["a1"]));
    expect(out.get("a1")).toEqual({ expectedCents: 10000, tier: "SOCIAL" });
  });
});

describe("computeTiers — pondération par tranche de quotient familial", () => {
  it("applique le coefficient en pour-mille de l'utilisateur", () => {
    const permilleByUser = new Map([["a1", 500]]); // demi-tarif
    const out = computeTiers(campaign, ["a1"], [], new Set(), permilleByUser);
    expect(out.get("a1")).toEqual({ expectedCents: 5000, tier: "FIRST" });
  });

  it("arrondit le montant pondéré", () => {
    const camp: TierCampaign = { amountCents: 333, secondChildCents: null, socialCents: null };
    const permilleByUser = new Map([["a1", 333]]);
    const out = computeTiers(camp, ["a1"], [], new Set(), permilleByUser);
    // 333 * 333 / 1000 = 110.889 → arrondi à 111.
    expect(out.get("a1")?.expectedCents).toBe(111);
  });

  it("coefficient par défaut ×1.0 quand l'utilisateur n'a pas de tranche renseignée", () => {
    const permilleByUser = new Map([["autre-id", 500]]);
    const out = computeTiers(campaign, ["a1"], [], new Set(), permilleByUser);
    expect(out.get("a1")).toEqual({ expectedCents: 10000, tier: "FIRST" });
  });
});
