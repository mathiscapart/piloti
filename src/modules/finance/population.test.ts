// Tests de src/modules/finance/population.ts — qui fait partie d'une campagne
// de cotisation (#106). Cette règle décide des lignes affichées au trésorier,
// des familles relancées et des comptes sur lesquels un paiement ou un
// échelonnement peut être saisi : un écart entre les trois fait compter de
// l'argent dans « Encaissé » sans qu'il apparaisse sur aucune ligne.

import { describe, expect, it } from "vitest";

import { campaignPopulationWhere, isInCampaignPopulation } from "./population";

const scout = (over: Partial<{ status: string; roles: string; unit: string | null }> = {}) => ({
  status: "ACTIVE",
  roles: JSON.stringify(["SCOUT"]),
  unit: "LOUVETEAUX",
  ...over,
});

describe("isInCampaignPopulation — campagne d'une unité", () => {
  const campaign = { unit: "LOUVETEAUX" };

  it("un jeune actif de l'unité en fait partie", () => {
    expect(isInCampaignPopulation(campaign, scout())).toBe(true);
  });

  it("un jeune d'une autre unité n'en fait pas partie", () => {
    expect(isInCampaignPopulation(campaign, scout({ unit: "PIONNIERS" }))).toBe(false);
  });

  it("un jeune sans unité n'en fait pas partie", () => {
    expect(isInCampaignPopulation(campaign, scout({ unit: null }))).toBe(false);
  });
});

describe("isInCampaignPopulation — campagne de groupe (sans unité)", () => {
  const campaign = { unit: null };

  it("tout jeune actif en fait partie, quelle que soit son unité", () => {
    expect(isInCampaignPopulation(campaign, scout({ unit: "PIONNIERS" }))).toBe(true);
    expect(isInCampaignPopulation(campaign, scout({ unit: null }))).toBe(true);
  });

  it("un parent n'en fait pas partie (cas de l'issue : 7 € sur parent.test)", () => {
    expect(
      isInCampaignPopulation(campaign, scout({ roles: JSON.stringify(["PARENT"]) })),
    ).toBe(false);
  });

  it("un jeune qui porte aussi un autre rôle en fait partie", () => {
    expect(
      isInCampaignPopulation(campaign, scout({ roles: JSON.stringify(["PARENT", "SCOUT"]) })),
    ).toBe(true);
  });

  it("un rôle dont le nom contient seulement « SCOUT » ne suffit pas", () => {
    expect(
      isInCampaignPopulation(campaign, scout({ roles: JSON.stringify(["SCOUTS"]) })),
    ).toBe(false);
  });

  it("un compte non actif n'en fait pas partie", () => {
    for (const status of ["PENDING", "SUSPENDED", "REJECTED"]) {
      expect(isInCampaignPopulation(campaign, scout({ status }))).toBe(false);
    }
  });

  it("des rôles illisibles excluent le compte au lieu de lever une erreur", () => {
    expect(isInCampaignPopulation(campaign, scout({ roles: "pas du json" }))).toBe(false);
  });
});

describe("campaignPopulationWhere — préfiltre Prisma", () => {
  it("restreint à l'unité de la campagne quand elle en a une", () => {
    expect(campaignPopulationWhere("LOUVETEAUX")).toEqual({
      status: "ACTIVE",
      roles: { contains: "SCOUT" },
      unit: "LOUVETEAUX",
    });
  });

  it("ne filtre pas l'unité pour une campagne de groupe", () => {
    expect(campaignPopulationWhere(null)).toEqual({
      status: "ACTIVE",
      roles: { contains: "SCOUT" },
    });
  });
});

describe("isInCampaignPopulation — cas limites des rôles", () => {
  const campaign = { unit: null };

  it("un JSON valide qui n'est pas un tableau exclut le compte", () => {
    for (const roles of ["null", "{}", "42", '{"SCOUT":true}']) {
      expect(isInCampaignPopulation(campaign, scout({ roles }))).toBe(false);
    }
  });

  it("une chaîne JSON « SCOUT » n'est pas un tableau de rôles et exclut le compte", () => {
    // DÉFAUT : String.prototype.includes fait passer '"SCOUT"' (et '"SCOUTS"').
    expect(isInCampaignPopulation(campaign, scout({ roles: '"SCOUT"' }))).toBe(false);
    expect(isInCampaignPopulation(campaign, scout({ roles: '"SCOUTS"' }))).toBe(false);
  });

  it("le rôle est sensible à la casse", () => {
    expect(isInCampaignPopulation(campaign, scout({ roles: '["scout"]' }))).toBe(false);
  });

  it("un tableau de rôles vide exclut le compte", () => {
    expect(isInCampaignPopulation(campaign, scout({ roles: "[]" }))).toBe(false);
  });
});

describe("isInCampaignPopulation — unité vide côté campagne", () => {
  it("une unité chaîne vide se comporte comme une campagne de groupe", () => {
    expect(isInCampaignPopulation({ unit: "" }, scout({ unit: "PIONNIERS" }))).toBe(true);
    expect(isInCampaignPopulation({ unit: "" }, scout({ unit: null }))).toBe(true);
  });
});

describe("cohérence campaignPopulationWhere / isInCampaignPopulation", () => {
  // Évalue le préfiltre en mémoire, comme le ferait Prisma.
  const matchesWhere = (
    where: ReturnType<typeof campaignPopulationWhere>,
    u: { status: string; roles: string; unit: string | null },
  ) =>
    u.status === where.status &&
    u.roles.includes(where.roles.contains) &&
    (!("unit" in where) || u.unit === where.unit);

  it("tout compte accepté par le prédicat satisfait le préfiltre", () => {
    const statuses = ["ACTIVE", "PENDING", "SUSPENDED"];
    const roles = ['["SCOUT"]', '["PARENT","SCOUT"]', '["SCOUTS"]', '["PARENT"]', "[]", "null", '"SCOUT"', '["scout"]', "pas du json"];
    const units = [null, "LOUVETEAUX", "PIONNIERS"];
    for (const campUnit of [null, "", "LOUVETEAUX"]) {
      for (const status of statuses) {
        for (const r of roles) {
          for (const unit of units) {
            const user = { status, roles: r, unit };
            if (isInCampaignPopulation({ unit: campUnit }, user)) {
              expect(matchesWhere(campaignPopulationWhere(campUnit), user)).toBe(true);
            }
          }
        }
      }
    }
  });
});
