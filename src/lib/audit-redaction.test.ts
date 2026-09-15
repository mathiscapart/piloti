// RGPD-04 — l'anonymisation d'un compte ne doit pas laisser de PII en clair
// dans les `AuditLog.metadata` qui le concernent (issue #94). Cette fonction
// pure décide, entrée par entrée, ce qui peut rester lisible dans le journal
// d'audit une fois l'utilisateur anonymisé.

import { describe, expect, it } from "vitest";
import { redactAuditMetadata } from "@/lib/audit-redaction";

const USER_ID = "user_123";

describe("redactAuditMetadata", () => {
  it("retire les clés non-id et non structurelles, et marque l'entrée", () => {
    const raw = JSON.stringify({ targetUserId: USER_ID, reason: "Comportement inadapté" });
    const result = redactAuditMetadata(raw, USER_ID);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual({ targetUserId: USER_ID, redacted: true });
  });

  it("conserve les valeurs de dates (from/to) hors liste blanche : elles disparaissent", () => {
    // USER_BIRTHDATE_CHANGED — from/to sont des dates de naissance, pas des ids.
    const raw = JSON.stringify({
      targetUserId: USER_ID,
      from: "2010-01-01T00:00:00.000Z",
      to: "2010-06-15T00:00:00.000Z",
    });
    const result = redactAuditMetadata(raw, USER_ID);
    expect(JSON.parse(result!)).toEqual({ targetUserId: USER_ID, redacted: true });
  });

  it("conserve toute clé finissant par Id/Ids, même si elle référence une autre personne", () => {
    // USER_CHILD_ACCOUNT_CREATED — guardianUserId référence un AUTRE utilisateur
    // que celui anonymisé (targetUserId), mais reste un id, jamais du texte libre.
    // `note` (texte libre imaginaire) force le retrait pour observer le tri.
    const raw = JSON.stringify({
      targetUserId: USER_ID,
      guardianUserId: "guardian_456",
      consentId: "consent_1",
      familyLinkId: "link_1",
      note: "Marie, la maman",
    });
    const result = redactAuditMetadata(raw, USER_ID);
    expect(JSON.parse(result!)).toEqual({
      targetUserId: USER_ID,
      guardianUserId: "guardian_456",
      consentId: "consent_1",
      familyLinkId: "link_1",
      redacted: true,
    });
  });

  it("conserve la petite liste blanche de clés structurelles (non personnelles)", () => {
    const raw = JSON.stringify({
      targetUserId: USER_ID,
      unit: "SCOUTS",
      assignedRoles: ["CHEF"],
      profileUpdated: true,
      fields: ["firstName", "lastName"],
    });
    const result = redactAuditMetadata(raw, USER_ID);
    // Rien à retirer ici : pas de `redacted: true`, et la fonction ne réécrit
    // pas une entrée qui ne change pas.
    expect(result).toBeNull();
  });

  it("retourne null si aucune valeur de premier niveau ne référence l'utilisateur", () => {
    const raw = JSON.stringify({ placeId: "place_1", name: "Le Local" });
    expect(redactAuditMetadata(raw, USER_ID)).toBeNull();
  });

  it("retourne null si rien ne doit être retiré (déjà minimal)", () => {
    const raw = JSON.stringify({ targetUserId: USER_ID });
    expect(redactAuditMetadata(raw, USER_ID)).toBeNull();
  });

  it("ne plante pas sur un JSON invalide", () => {
    expect(redactAuditMetadata("{not json", USER_ID)).toBeNull();
  });

  it("ne plante pas sur un JSON qui n'est pas un objet", () => {
    expect(redactAuditMetadata("[1,2,3]", USER_ID)).toBeNull();
    expect(redactAuditMetadata("null", USER_ID)).toBeNull();
    expect(redactAuditMetadata('"texte"', USER_ID)).toBeNull();
  });
});
