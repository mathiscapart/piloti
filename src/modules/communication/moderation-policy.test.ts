// Tests de src/modules/communication/moderation-policy.ts (SAFE-02) — la
// décision de visibilité d'un message masqué et l'éligibilité à traiter la
// file de modération. On verrouille en priorité le fait qu'un message masqué
// reste invisible même pour un rôle qui peut seulement *consulter* la file
// (RESPONSABLE_GROUPE) : seul `moderation.review` (CHEF/ADMIN) débloque le
// traitement.
//
// Raffinement SAFE-02 (routage par unité) — trois fonctions pures
// supplémentaires : détermination de l'unité concernée (`resolveConcernedUnit`),
// éligibilité d'un modérateur pour UN signalement donné (`canModerateReport`),
// et sélection des destinataires de la notification de création
// (`selectReportRecipients`). Le fil rouge des tests : un CHEF n'a de prise
// que sur SON unité, jamais sur une autre ; l'ADMIN n'a aucune restriction.

import { describe, expect, it } from "vitest";

import {
  canModerate,
  canModerateReport,
  isVisibleMessage,
  resolveConcernedUnit,
  selectReportRecipients,
} from "./moderation-policy";

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

describe("resolveConcernedUnit", () => {
  it("reprend l'unité de l'auteur du message signalé", () => {
    expect(resolveConcernedUnit({ unit: "SCOUTS" })).toBe("SCOUTS");
  });

  it("retourne null si l'auteur n'a pas d'unité renseignée", () => {
    expect(resolveConcernedUnit({ unit: null })).toBeNull();
  });

  it("retourne null si l'auteur n'a pas pu être résolu (message introuvable)", () => {
    expect(resolveConcernedUnit(null)).toBeNull();
    expect(resolveConcernedUnit(undefined)).toBeNull();
  });
});

describe("canModerateReport", () => {
  it("autorise l'ADMIN sur un signalement de n'importe quelle unité", () => {
    const admin = { role: "ADMIN", roles: ["ADMIN"], status: "ACTIVE", unit: null };
    expect(canModerateReport(admin, { concernedUnit: "SCOUTS" })).toBe(true);
    expect(canModerateReport(admin, { concernedUnit: null })).toBe(true);
  });

  it("autorise un CHEF sur un signalement de SA propre unité", () => {
    const chef = { role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(chef, { concernedUnit: "SCOUTS" })).toBe(true);
  });

  it("refuse un CHEF sur un signalement d'une AUTRE unité", () => {
    const chef = { role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(chef, { concernedUnit: "LOUVETEAUX" })).toBe(false);
  });

  it("refuse un CHEF sur un signalement sans unité concernée (fail-closed)", () => {
    const chef = { role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(chef, { concernedUnit: null })).toBe(false);
  });

  it("refuse un RESPONSABLE_GROUPE (lecture seule, pas moderation.review)", () => {
    const rg = { role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(rg, { concernedUnit: "SCOUTS" })).toBe(false);
  });
});

describe("selectReportRecipients", () => {
  const admin = { id: "u-admin", role: "ADMIN", roles: ["ADMIN"], unit: null };
  const chefScouts = { id: "u-chef-scouts", role: "CHEF", roles: ["CHEF"], unit: "SCOUTS" };
  const chefLouveteaux = { id: "u-chef-louvet", role: "CHEF", roles: ["CHEF"], unit: "LOUVETEAUX" };
  const parent = { id: "u-parent", role: "PARENT", roles: ["PARENT"], unit: "SCOUTS" };

  it("sélectionne tous les ADMIN + les CHEF de l'unité concernée uniquement", () => {
    const recipients = selectReportRecipients(
      [admin, chefScouts, chefLouveteaux, parent],
      "SCOUTS",
    );
    expect(recipients.sort()).toEqual(["u-admin", "u-chef-scouts"].sort());
  });

  it("n'inclut jamais un chef d'une autre unité", () => {
    const recipients = selectReportRecipients([chefLouveteaux], "SCOUTS");
    expect(recipients).toEqual([]);
  });

  it("sans unité concernée, seuls les ADMIN sont notifiés (fail-closed)", () => {
    const recipients = selectReportRecipients([admin, chefScouts, chefLouveteaux], null);
    expect(recipients).toEqual(["u-admin"]);
  });

  it("ne sélectionne jamais un rôle sans droit de modération (parent, jeune…)", () => {
    const recipients = selectReportRecipients([parent], "SCOUTS");
    expect(recipients).toEqual([]);
  });
});
