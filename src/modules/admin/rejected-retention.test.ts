import { describe, expect, it } from "vitest";

import { rejectedPurgeDate, rejectedRetentionCutoff } from "./rejected-retention";

// RGPD — un compte REJECTED n'a plus vocation à exister au-delà de 30 jours
// (recours ou nouvelle demande) : au-delà, `rejected-purge.ts` l'anonymise.
// Ces bornes sont exactes : une erreur d'un jour ici purgerait un compte trop
// tôt ou en garderait un trop longtemps.

describe("rejectedRetentionCutoff", () => {
  it("recule de 30 jours par rapport à maintenant", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    expect(rejectedRetentionCutoff(now).toISOString()).toBe(
      "2026-08-16T12:00:00.000Z",
    );
  });

  it("la date affichée à l'admin coïncide avec le cutoff de la purge", () => {
    // Un compte refusé pile au cutoff atteint sa date d'anonymisation
    // maintenant : l'écran et la tâche planifiée ne peuvent pas diverger.
    const now = new Date("2026-09-15T12:00:00.000Z");
    const cutoff = rejectedRetentionCutoff(now);
    expect(rejectedPurgeDate(cutoff).getTime()).toBe(now.getTime());
  });
});

describe("rejectedPurgeDate", () => {
  it("avance de 30 jours par rapport à rejectedAt", () => {
    const rejectedAt = new Date("2026-08-16T12:00:00.000Z");
    expect(rejectedPurgeDate(rejectedAt).toISOString()).toBe(
      "2026-09-15T12:00:00.000Z",
    );
  });
});
