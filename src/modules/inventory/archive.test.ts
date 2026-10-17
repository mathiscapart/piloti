// Tests de src/modules/inventory/archive.ts — règles d'archivage d'un article
// (issue #110). Une erreur ici laisse un prêt en cours pointer vers un article
// masqué, ou rend modifiable un article archivé.

import { describe, expect, it } from "vitest";
import { ACTIVE_LOAN_STATUSES, LOAN_STATUSES } from "@/lib/enums";
import {
  ACTIVE_LOAN_ARCHIVE_ERROR,
  ARCHIVED_READ_ONLY_ERROR,
  archiveRefusal,
  updateRefusal,
} from "./archive";

describe("archiveRefusal", () => {
  it("aucun prêt → archivage autorisé", () => {
    expect(archiveRefusal([])).toBeNull();
  });

  it("uniquement des prêts rendus → archivage autorisé", () => {
    expect(archiveRefusal(["RETOURNE", "RETOURNE"])).toBeNull();
  });

  // Verrou de cohérence : la règle suit la source unique des statuts. Si un
  // statut est ajouté à ACTIVE_LOAN_STATUSES, ce test le couvre sans édition.
  it.each([...ACTIVE_LOAN_STATUSES])(
    "chaque statut de ACTIVE_LOAN_STATUSES seul (%s) → refusé",
    (status) => {
      expect(archiveRefusal([status])).toBe(ACTIVE_LOAN_ARCHIVE_ERROR);
    },
  );

  it("chaque statut de LOAN_STATUSES hors actifs → autorisé", () => {
    const active: readonly string[] = ACTIVE_LOAN_STATUSES;
    const inactive = LOAN_STATUSES.filter((s) => !active.includes(s));
    expect(inactive.length).toBeGreaterThan(0);
    for (const status of inactive) {
      expect(archiveRefusal([status])).toBeNull();
    }
  });

  it("un seul prêt actif parmi beaucoup de rendus → refusé, quelle que soit sa position", () => {
    expect(archiveRefusal(["ACTIF", "RETOURNE", "RETOURNE"])).toBe(
      ACTIVE_LOAN_ARCHIVE_ERROR,
    );
    expect(archiveRefusal(["RETOURNE", "RETOURNE", "RETARD"])).toBe(
      ACTIVE_LOAN_ARCHIVE_ERROR,
    );
  });

  it("plusieurs prêts actifs → un seul message (pas de cumul)", () => {
    expect(archiveRefusal(["ACTIF", "RETARD", "SECHAGE"])).toBe(
      ACTIVE_LOAN_ARCHIVE_ERROR,
    );
  });

  it("statut inconnu ou vide → ignoré, ne bloque pas l'archivage", () => {
    expect(archiveRefusal(["INCONNU", ""])).toBeNull();
  });

  it("statut inconnu mêlé à un prêt actif → refusé", () => {
    expect(archiveRefusal(["INCONNU", "ACTIF"])).toBe(
      ACTIVE_LOAN_ARCHIVE_ERROR,
    );
  });

  it("comparaison sensible à la casse (les statuts sont des constantes exactes)", () => {
    expect(archiveRefusal(["actif"])).toBeNull();
  });

  it("message attendu par l'issue #110", () => {
    expect(ACTIVE_LOAN_ARCHIVE_ERROR).toBe(
      "Cet article est en prêt : clôture le prêt avant de l'archiver.",
    );
  });
});

describe("updateRefusal", () => {
  it("article actif → modification autorisée", () => {
    expect(updateRefusal({ archived: false })).toBeNull();
  });

  it("article archivé → modification refusée", () => {
    expect(updateRefusal({ archived: true })).toBe(ARCHIVED_READ_ONLY_ERROR);
  });

  it("article introuvable → refus explicite", () => {
    expect(updateRefusal(null)).toBe("Article introuvable.");
  });

  it("message de lecture seule (verrou du texte affiché)", () => {
    expect(ARCHIVED_READ_ONLY_ERROR).toBe(
      "Cet article est archivé : restaure-le avant de le modifier.",
    );
  });
});
