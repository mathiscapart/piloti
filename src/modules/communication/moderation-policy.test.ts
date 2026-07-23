// Tests de src/modules/communication/moderation-policy.ts (SAFE-02) — la
// décision de visibilité d'un message masqué et l'éligibilité à traiter la
// file de modération. On verrouille en priorité le fait qu'un message masqué
// reste invisible même pour un rôle qui peut seulement *consulter* la file
// (RESPONSABLE_GROUPE) : seul `moderation.review` (CHEF/ADMIN) débloque le
// traitement.

import { describe, expect, it } from "vitest";

import { canModerate, isVisibleMessage } from "./moderation-policy";

describe("isVisibleMessage", () => {
  it("un message non masqué (hiddenAt=null) est visible", () => {
    expect(isVisibleMessage(null)).toBe(true);
  });

  it("un message masqué (hiddenAt renseigné) n'est plus visible", () => {
    expect(isVisibleMessage(new Date())).toBe(false);
  });
});

describe("canModerate", () => {
  it("autorise le CHEF à traiter la file de modération", () => {
    expect(canModerate({ role: "CHEF", roles: ["CHEF"], status: "ACTIVE" })).toBe(true);
  });

  it("autorise l'ADMIN (superutilisateur)", () => {
    expect(canModerate({ role: "ADMIN", roles: ["ADMIN"], status: "ACTIVE" })).toBe(true);
  });

  it("refuse le RESPONSABLE_GROUPE — lecture seule (moderation.view), pas le traitement", () => {
    expect(
      canModerate({
        role: "RESPONSABLE_GROUPE",
        roles: ["RESPONSABLE_GROUPE"],
        status: "ACTIVE",
      }),
    ).toBe(false);
  });

  it("refuse un PARENT ou un SCOUT", () => {
    expect(canModerate({ role: "PARENT", roles: ["PARENT"], status: "ACTIVE" })).toBe(false);
    expect(canModerate({ role: "SCOUT", roles: ["SCOUT"], status: "ACTIVE" })).toBe(false);
  });

  it("refuse un CHEF dont le compte n'est pas ACTIVE", () => {
    expect(canModerate({ role: "CHEF", roles: ["CHEF"], status: "PENDING" })).toBe(false);
  });
});
