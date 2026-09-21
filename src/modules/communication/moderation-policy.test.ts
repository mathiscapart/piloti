// Tests de src/modules/communication/moderation-policy.ts (SAFE-02) — la
// décision de visibilité d'un message masqué et l'éligibilité à traiter la
// file de modération. On verrouille en priorité le fait qu'un message masqué
// reste invisible pour tous. Le traitement (`moderation.review`) est ouvert aux
// CHEF, au RESPONSABLE_GROUPE et à l'ADMIN.
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
  parseTargetSnapshot,
  reportTargetState,
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

  it("autorise le RESPONSABLE_GROUPE à traiter la file (toutes unités)", () => {
    expect(
      canModerate({
        role: "RESPONSABLE_GROUPE",
        roles: ["RESPONSABLE_GROUPE"],
        status: "ACTIVE",
      }),
    ).toBe(true);
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
    expect(canModerateReport(admin, { concernedUnit: "SCOUTS", targetAuthorId: null })).toBe(true);
    expect(canModerateReport(admin, { concernedUnit: null, targetAuthorId: null })).toBe(true);
  });

  it("autorise un CHEF sur un signalement de SA propre unité", () => {
    const chef = { role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(chef, { concernedUnit: "SCOUTS", targetAuthorId: null })).toBe(true);
  });

  it("refuse un CHEF sur un signalement d'une AUTRE unité", () => {
    const chef = { role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(chef, { concernedUnit: "LOUVETEAUX", targetAuthorId: null })).toBe(false);
  });

  it("refuse un CHEF sur un signalement sans unité concernée (fail-closed)", () => {
    const chef = { role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(chef, { concernedUnit: null, targetAuthorId: null })).toBe(false);
  });

  it("autorise le RESPONSABLE_GROUPE sur toutes les unités", () => {
    const rg = { role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(rg, { concernedUnit: "LOUVETEAUX", targetAuthorId: null })).toBe(true);
    expect(canModerateReport(rg, { concernedUnit: null, targetAuthorId: null })).toBe(true);
  });

  it("autorise un RESPONSABLE_GROUPE même sur une unité autre que la sienne", () => {
    const rg = { role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE"], status: "ACTIVE", unit: "SCOUTS" };
    expect(canModerateReport(rg, { concernedUnit: "PIONNIERS", targetAuthorId: null })).toBe(true);
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
      null,
    );
    expect(recipients.sort()).toEqual(["u-admin", "u-chef-scouts"].sort());
  });

  it("n'inclut jamais un chef d'une autre unité", () => {
    const recipients = selectReportRecipients([chefLouveteaux], "SCOUTS", null);
    expect(recipients).toEqual([]);
  });

  it("sans unité concernée, seuls les ADMIN sont notifiés (fail-closed)", () => {
    const recipients = selectReportRecipients([admin, chefScouts, chefLouveteaux], null, null);
    expect(recipients).toEqual(["u-admin"]);
  });

  it("ne sélectionne jamais un rôle sans droit de modération (parent, jeune…)", () => {
    const recipients = selectReportRecipients([parent], "SCOUTS", null);
    expect(recipients).toEqual([]);
  });
});

// #91 — l'auteur du contenu signalé ne doit ni recevoir l'alerte, ni voir, ni
// traiter le signalement qui le vise ; le RG est toujours notifié (recours
// indépendant de l'unité, y compris quand l'auteur est le seul chef).
describe("exclusion de l'auteur du contenu signalé (#91)", () => {
  const author = { id: "u-thomas", role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "PIONNIERS" };
  const peer = { id: "u-chef-pio", role: "CHEF", roles: ["CHEF"], status: "ACTIVE", unit: "PIONNIERS" };
  const rg = { id: "u-rg", role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE"], status: "ACTIVE", unit: null };
  const admin = { id: "u-admin", role: "ADMIN", roles: ["ADMIN"], status: "ACTIVE", unit: null };
  const report = { concernedUnit: "PIONNIERS", targetAuthorId: "u-thomas" };

  it("canModerateReport refuse l'auteur du contenu, même chef de l'unité", () => {
    expect(canModerateReport(author, report)).toBe(false);
  });

  it("canModerateReport refuse l'auteur même ADMIN ou RG", () => {
    expect(canModerateReport(admin, { ...report, targetAuthorId: "u-admin" })).toBe(false);
    expect(canModerateReport(rg, { ...report, targetAuthorId: "u-rg" })).toBe(false);
  });

  it("canModerateReport autorise un autre chef de l'unité, le RG et l'ADMIN", () => {
    expect(canModerateReport(peer, report)).toBe(true);
    expect(canModerateReport(rg, report)).toBe(true);
    expect(canModerateReport(admin, report)).toBe(true);
  });

  it("selectReportRecipients exclut l'auteur et inclut le RG", () => {
    const recipients = selectReportRecipients([author, peer, rg, admin], "PIONNIERS", "u-thomas");
    expect(recipients.sort()).toEqual(["u-admin", "u-chef-pio", "u-rg"].sort());
  });

  it("auteur seul chef de l'unité : le RG et l'ADMIN restent notifiés", () => {
    const recipients = selectReportRecipients([author, rg, admin], "PIONNIERS", "u-thomas");
    expect(recipients.sort()).toEqual(["u-admin", "u-rg"].sort());
  });

  it("signalement sans unité concernée : le RG est notifié en plus de l'ADMIN", () => {
    const recipients = selectReportRecipients([peer, rg, admin], null, "u-parent");
    expect(recipients.sort()).toEqual(["u-admin", "u-rg"].sort());
  });
});

// #92 — copie du message prise au signalement (modèle Discord) : c'est la
// preuve de référence, comparée au message actuel pour indiquer à la
// modération s'il a été modifié ou supprimé depuis.
describe("copie du contenu signalé (#92)", () => {
  const snapshot = { body: "texte d'origine", authorId: "u-auteur" };

  it("parseTargetSnapshot relit la copie stockée", () => {
    expect(parseTargetSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("parseTargetSnapshot renvoie null sans copie (signalement antérieur) ou si elle est illisible", () => {
    expect(parseTargetSnapshot(null)).toBeNull();
    expect(parseTargetSnapshot("pas du json")).toBeNull();
    expect(parseTargetSnapshot(JSON.stringify({ body: "x" }))).toBeNull();
  });

  it("reportTargetState : inchangé, modifié ou supprimé par rapport à la copie", () => {
    expect(reportTargetState(snapshot, { body: "texte d'origine" })).toBe("UNCHANGED");
    expect(reportTargetState(snapshot, { body: "texte adouci" })).toBe("EDITED");
    expect(reportTargetState(snapshot, null)).toBe("DELETED");
  });

  it("reportTargetState : sans copie, l'état est inconnu", () => {
    expect(reportTargetState(null, { body: "x" })).toBeNull();
    expect(reportTargetState(null, null)).toBeNull();
  });
});
