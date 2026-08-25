import { describe, expect, it } from "vitest";

import { parseOwnerEmail } from "./types";

// RGPD-09 — `parseOwnerEmail` n'est pas un confort de saisie : c'est le contrôle
// qui empêche l'application de devenir un relais d'envoi vers une adresse
// arbitraire. Une validation non testée se dégrade en silence, et personne ne
// s'en aperçoit avant qu'elle serve.
describe("parseOwnerEmail", () => {
  it("accepte une adresse normale et la normalise", () => {
    const res = parseOwnerEmail("  Contact@Example.FR ");
    expect(res).toEqual({ ok: true, value: "contact@example.fr" });
  });

  it("traite l'absence d'adresse comme légitime, pas comme une erreur", () => {
    // Un propriétaire peut n'avoir qu'un téléphone : le champ vide est valide,
    // et doit se distinguer d'une saisie erronée que le chef doit corriger.
    for (const vide of ["", "   ", null, undefined]) {
      expect(parseOwnerEmail(vide)).toEqual({ ok: true, value: null });
    }
  });

  it("refuse une chaîne qui n'est pas une adresse", () => {
    for (const mauvais of ["pas-une-adresse", "@example.fr", "a@", "a@b"]) {
      expect(parseOwnerEmail(mauvais).ok).toBe(false);
    }
  });

  it("refuse plusieurs destinataires dans un seul champ", () => {
    // Sans ce refus, un chef pourrait diffuser un envoi à une liste entière.
    for (const multi of [
      "a@example.fr,b@example.fr",
      "a@example.fr;b@example.fr",
      "a@example.fr b@example.fr",
    ]) {
      expect(parseOwnerEmail(multi).ok).toBe(false);
    }
  });

  it("refuse les caractères de contrôle et les chevrons", () => {
    // Injection d'en-tête : la sérialisation JSON du fournisseur la neutralise
    // déjà, mais on ne fait pas reposer une propriété de sécurité sur le
    // comportement d'un tiers.
    const controle = ["a@example.fr\r\nBcc: victime@example.fr", "<a@example.fr>"];
    for (const mauvais of controle) {
      expect(parseOwnerEmail(mauvais).ok).toBe(false);
    }
  });

  it("refuse au-delà de la longueur maximale d'une adresse (RFC 5321)", () => {
    const tropLong = `${"a".repeat(250)}@example.fr`;
    expect(parseOwnerEmail(tropLong).ok).toBe(false);
  });
});
