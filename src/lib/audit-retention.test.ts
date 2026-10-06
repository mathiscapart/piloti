// #163 — durées de conservation du journal d'audit. Le texte des messages de
// salon (MESSAGE_EDITED.previousBody, MESSAGE_DELETED.body) est retiré après
// 1 an ; le journal entier est supprimé après AUDIT_RETENTION_YEARS (10 par
// défaut). Ces fonctions pures décident de la date seuil et du contenu
// expurgé ; `src/modules/admin/audit-purge.ts` les applique en base.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUDIT_RETENTION_YEARS,
  MESSAGE_TEXT_RETENTION_YEARS,
  parseAuditRetentionYears,
  retentionCutoff,
  stripExpiredMessageText,
} from "@/lib/audit-retention";

describe("parseAuditRetentionYears", () => {
  it("vaut 10 ans quand la variable est absente ou vide", () => {
    expect(DEFAULT_AUDIT_RETENTION_YEARS).toBe(10);
    expect(parseAuditRetentionYears(undefined)).toBe(10);
    // docker-compose passe une chaîne vide quand la variable n'est pas posée.
    expect(parseAuditRetentionYears("")).toBe(10);
    expect(parseAuditRetentionYears("  ")).toBe(10);
  });

  it("accepte un nombre entier d'années", () => {
    expect(parseAuditRetentionYears("1")).toBe(1);
    expect(parseAuditRetentionYears(" 6 ")).toBe(6);
    expect(parseAuditRetentionYears("100")).toBe(100);
  });

  it.each(["0", "-3", "2.5", "1e1", "dix", "10ans", "0x0A", "101"])(
    "refuse « %s »",
    (raw) => {
      expect(() => parseAuditRetentionYears(raw)).toThrow(/AUDIT_RETENTION_YEARS/);
    },
  );

  it("ne peut pas purger le journal avant le texte des messages", () => {
    // Plus petite valeur acceptée = durée du texte des messages : le journal
    // n'est jamais supprimé avant que ce texte n'ait atteint sa propre limite.
    expect(MESSAGE_TEXT_RETENTION_YEARS).toBe(1);
    expect(parseAuditRetentionYears("1")).toBeGreaterThanOrEqual(
      MESSAGE_TEXT_RETENTION_YEARS,
    );
  });
});

describe("retentionCutoff", () => {
  it("recule d'un nombre d'années calendaires", () => {
    const now = new Date("2026-09-23T12:00:00.000Z");
    expect(retentionCutoff(1, now).toISOString()).toBe("2025-09-23T12:00:00.000Z");
    expect(retentionCutoff(10, now).toISOString()).toBe("2016-09-23T12:00:00.000Z");
  });

  it("un 29 février recule au 1er mars de l'année non bissextile", () => {
    const now = new Date("2028-02-29T00:00:00.000Z");
    expect(retentionCutoff(1, now).toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });
});

describe("stripExpiredMessageText", () => {
  it("retire previousBody d'un MESSAGE_EDITED et garde les autres clés", () => {
    const raw = JSON.stringify({
      messageId: "m1",
      channelId: "c1",
      authorId: "u1",
      previousBody: "texte d'origine",
    });
    expect(JSON.parse(stripExpiredMessageText("MESSAGE_EDITED", raw)!)).toEqual({
      messageId: "m1",
      channelId: "c1",
      authorId: "u1",
      redacted: true,
    });
  });

  it("retire body d'un MESSAGE_DELETED et garde les autres clés", () => {
    const raw = JSON.stringify({ messageId: "m1", authorId: "u1", body: "supprimé" });
    expect(JSON.parse(stripExpiredMessageText("MESSAGE_DELETED", raw)!)).toEqual({
      messageId: "m1",
      authorId: "u1",
      redacted: true,
    });
  });

  it("ne retire que la clé visée par l'action", () => {
    // `body` sur un MESSAGE_EDITED n'est pas le texte d'origine : on n'y touche pas.
    const raw = JSON.stringify({ messageId: "m1", body: "x", previousBody: "y" });
    expect(JSON.parse(stripExpiredMessageText("MESSAGE_EDITED", raw)!)).toEqual({
      messageId: "m1",
      body: "x",
      redacted: true,
    });
  });

  it("ignore les autres actions, même avec une clé body", () => {
    const raw = JSON.stringify({ announcementId: "a1", body: "annonce" });
    expect(stripExpiredMessageText("ANNOUNCEMENT_UPDATED", raw)).toBeNull();
  });

  it("est idempotent : une ligne déjà expurgée ne bouge plus", () => {
    const once = stripExpiredMessageText(
      "MESSAGE_DELETED",
      JSON.stringify({ messageId: "m1", body: "x" }),
    )!;
    expect(stripExpiredMessageText("MESSAGE_DELETED", once)).toBeNull();
  });

  it("ne touche pas une ligne déjà anonymisée par redactAuditMetadata", () => {
    const raw = JSON.stringify({ messageId: "m1", authorId: "u1", redacted: true });
    expect(stripExpiredMessageText("MESSAGE_EDITED", raw)).toBeNull();
  });

  it.each([null, "", "pas du json", "null", "[]", '"texte"'])(
    "ne plante pas sur une metadata inexploitable (%s)",
    (raw) => {
      expect(stripExpiredMessageText("MESSAGE_DELETED", raw)).toBeNull();
    },
  );
});
