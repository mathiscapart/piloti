import { describe, expect, it } from "vitest";

import {
  isConsentLinkExpired,
  isOwnerConsentRequestTooSoon,
  nextOwnerConsent,
  OWNER_CONSENT_LINK_TTL_DAYS,
  OWNER_CONSENT_REQUEST_INTERVAL_MINUTES,
} from "./owner-consent";

const JOUR_MS = 24 * 60 * 60 * 1000;
const ilYA = (jours: number) => new Date(Date.now() - jours * JOUR_MS);

// RGPD-09 — l'entropie du jeton (256 bits) le rend inattaquable ; c'est la durée
// d'exposition qui constitue le risque. Cette borne est donc un contrôle de
// sécurité à part entière, pas un détail d'ergonomie.
describe("isConsentLinkExpired", () => {
  it("accepte un lien émis aujourd'hui", () => {
    expect(isConsentLinkExpired(new Date())).toBe(false);
  });

  it("accepte un lien juste en deçà de la limite", () => {
    expect(isConsentLinkExpired(ilYA(OWNER_CONSENT_LINK_TTL_DAYS - 1))).toBe(false);
  });

  it("refuse un lien au-delà de la limite", () => {
    expect(isConsentLinkExpired(ilYA(OWNER_CONSENT_LINK_TTL_DAYS + 1))).toBe(true);
  });

  it("refuse un lien sans date d'émission", () => {
    // Fiche antérieure à RGPD-09 : aucune demande n'a jamais été envoyée, donc
    // aucun lien ne doit fonctionner. Le défaut doit fermer, pas ouvrir.
    expect(isConsentLinkExpired(null)).toBe(true);
    expect(isConsentLinkExpired(undefined)).toBe(true);
  });

  it("refuse un lien très ancien", () => {
    expect(isConsentLinkExpired(ilYA(365 * 3))).toBe(true);
  });
});

// #97 — l'accord vaut pour une PERSONNE, pas pour une fiche : il ne doit jamais
// survivre à un changement de ses coordonnées.
describe("nextOwnerConsent", () => {
  const dupont = { name: "Jean Dupont", phone: "06 12 34 56 78", email: "jean@exemple.fr" };
  const aucun = { name: null, phone: null, email: null };

  it("GRANTED + email changé → PENDING avec nouveau jeton", () => {
    expect(
      nextOwnerConsent("GRANTED", dupont, { ...dupont, email: "autre@exemple.fr" }),
    ).toEqual({ status: "PENDING", token: "NEW", reason: "CONTACT_CHANGED" });
  });

  it("GRANTED + téléphone changé → PENDING avec nouveau jeton", () => {
    expect(
      nextOwnerConsent("GRANTED", dupont, { ...dupont, phone: "07 00 00 00 00" }),
    ).toEqual({ status: "PENDING", token: "NEW", reason: "CONTACT_CHANGED" });
  });

  it("GRANTED + nom seul corrigé → statut inchangé", () => {
    expect(nextOwnerConsent("GRANTED", dupont, { ...dupont, name: "Jean Dupond" })).toBeNull();
  });

  it("GRANTED + contact identique → statut inchangé", () => {
    expect(nextOwnerConsent("GRANTED", dupont, { ...dupont })).toBeNull();
  });

  it("GRANTED + effacement → PENDING sans jeton", () => {
    expect(nextOwnerConsent("GRANTED", dupont, aucun)).toEqual({
      status: "PENDING",
      token: "NONE",
      reason: "CONTACT_ERASED",
    });
  });

  it("REFUSED + nouveau contact → PENDING avec nouveau jeton", () => {
    // Le refus a vidé les champs : toute saisie est un nouveau contact.
    expect(nextOwnerConsent("REFUSED", aucun, dupont)).toEqual({
      status: "PENDING",
      token: "NEW",
      reason: "CONTACT_CHANGED",
    });
  });

  it("GRANTED sans contact (fiche corrompue par #97) + nouveau contact → PENDING", () => {
    expect(nextOwnerConsent("GRANTED", aucun, dupont)).toEqual({
      status: "PENDING",
      token: "NEW",
      reason: "CONTACT_CHANGED",
    });
  });

  it("PENDING + email changé → nouveau jeton : l'ancien lien ne doit pas montrer le nouveau contact", () => {
    expect(
      nextOwnerConsent("PENDING", dupont, { ...dupont, email: "autre@exemple.fr" }),
    ).toEqual({ status: "PENDING", token: "NEW", reason: "CONTACT_CHANGED" });
  });

  it("REFUSED avec un contact ressaisi avant le correctif → PENDING à la prochaine modification", () => {
    // Fiche du cas c) de #97 : ressaisie enregistrée en REFUSED. Elle ne doit
    // pas y rester, sans quoi la fiche propose « Envoyer la demande » hors circuit.
    expect(nextOwnerConsent("REFUSED", dupont, { ...dupont })).toEqual({
      status: "PENDING",
      token: "NEW",
      reason: "CONTACT_CHANGED",
    });
  });

  it("REFUSED + toujours aucun contact → statut inchangé", () => {
    expect(nextOwnerConsent("REFUSED", aucun, aucun)).toBeNull();
  });
});

// #137 — le destinataire n'est pas utilisateur et ne peut pas se désabonner :
// le délai entre deux demandes est sa seule protection. Il vaut par ADRESSE,
// tous lieux confondus, sinon créer des lieux en série le contournerait.
describe("isOwnerConsentRequestTooSoon", () => {
  const MINUTE_MS = 60 * 1000;
  const now = new Date("2026-09-21T10:00:00Z").getTime();
  const envoi = (email: string | null, minutes: number) => ({
    email,
    requestedAt: new Date(now - minutes * MINUTE_MS),
  });

  it("même adresse il y a moins de 15 minutes → refusé", () => {
    expect(isOwnerConsentRequestTooSoon("jean@ferme.fr", [envoi("jean@ferme.fr", 5)], now)).toBe(true);
  });

  it("même adresse juste avant la limite → refusé", () => {
    const presque = { email: "jean@ferme.fr", requestedAt: new Date(now - OWNER_CONSENT_REQUEST_INTERVAL_MINUTES * MINUTE_MS + 1) };
    expect(isOwnerConsentRequestTooSoon("jean@ferme.fr", [presque], now)).toBe(true);
  });

  it("même adresse il y a 15 minutes ou plus → accepté", () => {
    expect(
      isOwnerConsentRequestTooSoon("jean@ferme.fr", [envoi("jean@ferme.fr", OWNER_CONSENT_REQUEST_INTERVAL_MINUTES)], now),
    ).toBe(false);
    expect(isOwnerConsentRequestTooSoon("jean@ferme.fr", [envoi("jean@ferme.fr", 60)], now)).toBe(false);
  });

  it("autre adresse, même récente → accepté", () => {
    expect(isOwnerConsentRequestTooSoon("jean@ferme.fr", [envoi("marie@ferme.fr", 1)], now)).toBe(false);
  });

  it("la casse ne distingue pas deux adresses", () => {
    expect(isOwnerConsentRequestTooSoon("jean@ferme.fr", [envoi("Jean@Ferme.FR", 1)], now)).toBe(true);
  });

  it("une trace sans adresse ou sans date ne bloque rien", () => {
    expect(
      isOwnerConsentRequestTooSoon(
        "jean@ferme.fr",
        [envoi(null, 1), { email: "jean@ferme.fr", requestedAt: null }],
        now,
      ),
    ).toBe(false);
  });

  it("aucune demande antérieure → accepté", () => {
    expect(isOwnerConsentRequestTooSoon("jean@ferme.fr", [], now)).toBe(false);
  });
});
