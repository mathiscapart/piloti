// Tests de src/modules/inventory/archive.ts — règles d'archivage d'un article
// (issue #110). Une erreur ici rend modifiable un article archivé, ou restaure
// un article dans une catégorie archivée.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_LOAN_ARCHIVE_ERROR,
  ARCHIVED_READ_ONLY_ERROR,
  restoreRefusal,
  showArchived,
  updateRefusal,
} from "./archive";

describe("ACTIVE_LOAN_ARCHIVE_ERROR", () => {
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

describe("restoreRefusal", () => {
  it("catégorie active → restauration autorisée", () => {
    expect(restoreRefusal({ archived: false, label: "Tentes" })).toBeNull();
  });

  // archiveCategory exige qu'aucun article actif n'y reste : restaurer l'article
  // seul recréerait cet état interdit.
  it("catégorie archivée → refusé, en nommant la catégorie", () => {
    expect(restoreRefusal({ archived: true, label: "Tentes" })).toBe(
      "Restaure d'abord la catégorie « Tentes ».",
    );
  });

  it("catégorie introuvable → ne bloque pas la restauration", () => {
    expect(restoreRefusal(null)).toBeNull();
  });
});

// Filtre « Archivés » de /stock : réservé à l'ADMIN. Le paramètre d'URL seul
// ne suffit pas — sinon n'importe quel rôle liste les archivés en tapant l'URL.
describe("showArchived", () => {
  const user = (role: string, status = "ACTIVE") => ({ role, roles: [role], status });

  it("ADMIN + archived=1 → liste les archivés", () => {
    expect(showArchived(user("ADMIN"), "1")).toBe(true);
  });

  it("ADMIN sans le paramètre → catalogue normal", () => {
    expect(showArchived(user("ADMIN"), undefined)).toBe(false);
  });

  it.each(["0", "", "true", "oui"])("ADMIN + archived=%j → ignoré", (value) => {
    expect(showArchived(user("ADMIN"), value)).toBe(false);
  });

  it.each(["RESPONSABLE_GROUPE", "RESPONSABLE_MATERIEL", "CHEF", "TRESORIER", "SECRETAIRE", "PARENT", "SCOUT"])(
    "%s + archived=1 → paramètre ignoré",
    (role) => {
      expect(showArchived(user(role), "1")).toBe(false);
    },
  );

  it("cumul de rôles non-admin (RG + MAT + CHEF) → ignoré", () => {
    const u = { role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE", "RESPONSABLE_MATERIEL", "CHEF"], status: "ACTIVE" };
    expect(showArchived(u, "1")).toBe(false);
  });

  it("ADMIN suspendu → ignoré", () => {
    expect(showArchived(user("ADMIN", "SUSPENDED"), "1")).toBe(false);
  });
});
