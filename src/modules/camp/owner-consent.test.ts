import { describe, expect, it } from "vitest";

import { isConsentLinkExpired, OWNER_CONSENT_LINK_TTL_DAYS } from "./owner-consent";

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
