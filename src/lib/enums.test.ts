// Tests de src/lib/enums.ts — pour l'instant limités à `YOUTH_UNITS` (#114) :
// le reste n'est que des listes de constantes/labels, sans logique à
// verrouiller. `unitAllowsLogin`/`NO_LOGIN_UNITS` sont supprimés : la règle
// « pas de connexion sous 15 ans » ne dépend plus de la branche mais de l'âge
// (cf. src/lib/legal/age.ts, canEnableLogin).

import { describe, expect, it } from "vitest";
import { UNITS, YOUTH_UNITS } from "./enums";

describe("YOUTH_UNITS (#114)", () => {
  it("contient toutes les branches UNITS sauf ADULTES", () => {
    expect(YOUTH_UNITS).toEqual(UNITS.filter((unit) => unit !== "ADULTES"));
  });

  it("ne contient pas ADULTES", () => {
    expect(YOUTH_UNITS).not.toContain("ADULTES");
  });

  it("contient bien les branches jeunes attendues", () => {
    expect(YOUTH_UNITS).toEqual([
      "FARFADETS",
      "LOUVETEAUX",
      "SCOUTS",
      "PIONNIERS",
      "COMPAGNONS",
    ]);
  });
});
