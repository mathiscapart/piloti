// Tests de src/modules/finance/family-dues.ts — ce qu'un parent ou un jeune
// voit de ses cotisations sur son tableau de bord (#106). Données de familles
// et de mineurs : un écart ici montre le statut de paiement d'une autre
// famille, ou cache un reste dû à celle qui le doit.

import { describe, expect, it } from "vitest";

import { dueLabel, familyDues, type DueCampaign } from "./family-dues";
import { formatEuros } from "./format";

const row = (
  id: string,
  firstName: string,
  expectedCents: number,
  paidCents: number,
  exempt = false,
) => ({ user: { id, firstName }, expectedCents, paidCents, exempt });

const campagne = (rows: DueCampaign["rows"], over: Partial<DueCampaign> = {}): DueCampaign => ({
  id: "c1",
  name: "Cotisation 2026-2027",
  rows,
  ...over,
});

// Une campagne avec deux familles : Vasseur (Élise, Robin) et Martin (Léo).
const groupe = campagne([
  row("elise", "Élise", 9500, 4800),
  row("robin", "Robin", 8000, 0),
  row("leo", "Léo", 9500, 0),
]);

describe("familyDues — parent", () => {
  it("parent avec 2 enfants : un reste par enfant, prénom visible", () => {
    expect(familyDues("nadege", ["elise", "robin"], [groupe])).toEqual([
      { campaignId: "c1", campaignName: "Cotisation 2026-2027", userId: "elise", firstName: "Élise", remainingCents: 4700, exempt: false },
      { campaignId: "c1", campaignName: "Cotisation 2026-2027", userId: "robin", firstName: "Robin", remainingCents: 8000, exempt: false },
    ]);
  });

  it("ne montre jamais l'enfant d'une autre famille", () => {
    const dues = familyDues("nadege", ["elise", "robin"], [groupe]);
    expect(dues.map((d) => d.userId)).not.toContain("leo");
  });

  it("parent d'un seul enfant : prénom masqué", () => {
    expect(familyDues("paul", ["leo"], [groupe])).toEqual([
      { campaignId: "c1", campaignName: "Cotisation 2026-2027", userId: "leo", firstName: null, remainingCents: 9500, exempt: false },
    ]);
  });

  it("le prénom reste visible si un seul des enfants doit encore quelque chose", () => {
    const c = campagne([row("elise", "Élise", 9500, 9500), row("robin", "Robin", 8000, 3000)]);
    expect(familyDues("nadege", ["elise", "robin"], [c])).toEqual([
      expect.objectContaining({ userId: "robin", firstName: "Robin", remainingCents: 5000 }),
    ]);
  });

  it("parent sans enfant rattaché : rien", () => {
    expect(familyDues("nadege", [], [groupe])).toEqual([]);
  });

  it("enfant rattaché mais hors de la campagne : rien pour lui", () => {
    expect(familyDues("nadege", ["iris"], [groupe])).toEqual([]);
  });
});

describe("familyDues — jeune", () => {
  it("jeune seul : uniquement son propre reste, sans prénom", () => {
    expect(familyDues("leo", [], [groupe])).toEqual([
      { campaignId: "c1", campaignName: "Cotisation 2026-2027", userId: "leo", firstName: null, remainingCents: 9500, exempt: false },
    ]);
  });

  it("un compte absent des lignes (ex. trésorier) : rien", () => {
    expect(familyDues("tresorier", [], [groupe])).toEqual([]);
  });
});

describe("familyDues — montants", () => {
  it("campagne soldée : rien", () => {
    expect(familyDues("leo", [], [campagne([row("leo", "Léo", 9500, 9500)])])).toEqual([]);
  });

  it("trop-perçu : rien, jamais de reste négatif", () => {
    expect(familyDues("leo", [], [campagne([row("leo", "Léo", 9500, 12000)])])).toEqual([]);
  });

  it("échelonnement (paiements partiels) : le reste après les versements", () => {
    expect(
      familyDues("leo", [], [campagne([row("leo", "Léo", 9000, 3000)], { name: "Camp en 3×" })]),
    ).toEqual([expect.objectContaining({ campaignName: "Camp en 3×", remainingCents: 6000 })]);
  });

  it("échelonnement convenu (exemption de relance) : le reste reste dû et est signalé", () => {
    expect(familyDues("leo", [], [campagne([row("leo", "Léo", 9500, 2000, true)])])).toEqual([
      expect.objectContaining({ remainingCents: 7500, exempt: true }),
    ]);
  });

  it("plusieurs campagnes : un reste par campagne", () => {
    const autre = campagne([row("leo", "Léo", 2000, 0)], { id: "c2", name: "Week-end" });
    expect(familyDues("leo", [], [groupe, autre]).map((d) => d.campaignId)).toEqual(["c1", "c2"]);
  });
});

describe("dueLabel — libellé de la carte", () => {
  const e = formatEuros(4700);
  const due = {
    campaignId: "c1", campaignName: "Week-end", userId: "leo",
    firstName: null, remainingCents: 4700, exempt: false,
  };

  it("« Cotisation <campagne> : reste X € »", () => {
    expect(dueLabel(due)).toBe(`Cotisation Week-end : reste ${e}`);
  });

  it("ne double pas « Cotisation » quand la campagne le porte déjà", () => {
    expect(dueLabel({ ...due, campaignName: "Cotisation 2026-2027" })).toBe(
      `Cotisation 2026-2027 : reste ${e}`,
    );
  });

  it("prénom entre parenthèses quand il est fourni", () => {
    expect(dueLabel({ ...due, firstName: "Élise" })).toBe(
      `Cotisation Week-end (Élise) : reste ${e}`,
    );
  });

  it("signale l'échelonnement convenu", () => {
    expect(dueLabel({ ...due, exempt: true })).toBe(
      `Cotisation Week-end : reste ${e} — échelonnement convenu`,
    );
  });
});
