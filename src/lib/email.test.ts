import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "./email";

// Le filtre anti-rebond protège la délivrabilité du domaine de PRODUCTION : le
// jeu de démonstration de staging est plein d'adresses en TLD réservé, et le
// domaine d'expédition est le même dans les deux environnements. Un test est
// donc justifié ici, alors que le reste de `email.ts` n'en a pas : ce n'est pas
// de l'ergonomie, c'est ce qui empêche staging d'abîmer la prod.
describe("sendEmail — adresses non délivrables", () => {
  const cle = process.env.RESEND_API_KEY;

  beforeEach(() => {
    // Aucune clé n'est posée : le filtre s'applique AVANT le test de
    // configuration, donc aucun appel réseau n'est déclenché par ces tests.
    delete process.env.RESEND_API_KEY;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (cle === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = cle;
    vi.restoreAllMocks();
  });

  it("refuse les TLD réservés par la RFC 6761", async () => {
    for (const adresse of [
      "parent3@example.invalid",
      "enfant-camille.leroy-4821@piloti.invalid",
      "quelquun@quelque.test",
      "admin@localhost",
    ]) {
      await sendEmail({ to: adresse, subject: "Test", html: "<p>x</p>" });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("non délivrable"),
      );
      vi.mocked(console.warn).mockClear();
    }
  });

  it("ignore la casse et les espaces autour de l'adresse", async () => {
    await sendEmail({ to: "  Parent@EXAMPLE.INVALID ", subject: "Test", html: "<p>x</p>" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("non délivrable"));
  });

  it("laisse passer une adresse ordinaire", async () => {
    // Sans clé configurée, l'envoi s'arrête à l'étape suivante : l'avertissement
    // émis prouve que le filtre n'a PAS retenu l'adresse, sans appel réseau.
    await sendEmail({ to: "contact@piloti.mathiscapart.xyz", subject: "Test", html: "<p>x</p>" });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY absent"),
    );
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("non délivrable"),
    );
  });
});
