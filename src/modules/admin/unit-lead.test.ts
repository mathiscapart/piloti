// #128 — cohérence entre le rôle CHEF et les unités encadrées (`UnitLead`).
// Même famille de piège que le miroir `role`/`roles` : un CHEF sans UnitLead
// n'a aucun périmètre (fail-closed), un non-CHEF avec UnitLead garderait une
// trace de périmètre qu'aucun rôle ne justifie.

import { describe, expect, it } from "vitest";

import { leadUnitsForRoles } from "./unit-lead";

describe("leadUnitsForRoles", () => {
  it("CHEF attribué à un compte avec une unité et sans UnitLead : encadre son unité", () => {
    expect(leadUnitsForRoles(["CHEF"], "SCOUTS", [])).toEqual(["SCOUTS"]);
  });

  it("CHEF déjà encadrant : ses UnitLead ne bougent pas, même hors de son unité", () => {
    expect(leadUnitsForRoles(["CHEF"], "COMPAGNONS", ["LOUVETEAUX"])).toEqual(["LOUVETEAUX"]);
    expect(leadUnitsForRoles(["CHEF", "TRESORIER"], "SCOUTS", ["SCOUTS", "PIONNIERS"])).toEqual([
      "SCOUTS",
      "PIONNIERS",
    ]);
  });

  it("CHEF sans unité et sans UnitLead : aucune unité encadrée", () => {
    expect(leadUnitsForRoles(["CHEF"], null, [])).toEqual([]);
  });

  it("CHEF retiré : plus aucune unité encadrée", () => {
    expect(leadUnitsForRoles(["TRESORIER"], "SCOUTS", ["SCOUTS"])).toEqual([]);
    expect(leadUnitsForRoles([], "SCOUTS", ["SCOUTS", "LOUVETEAUX"])).toEqual([]);
  });

  it("les rôles transverses n'ouvrent aucun UnitLead, même avec une unité", () => {
    expect(leadUnitsForRoles(["RESPONSABLE_GROUPE"], "ADULTES", [])).toEqual([]);
    expect(leadUnitsForRoles(["SCOUT"], "COMPAGNONS", [])).toEqual([]);
  });
});
