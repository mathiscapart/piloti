// Bornes de l'import CSV d'inventaire. Le fichier vient d'un utilisateur : ces
// plafonds sont la seule chose qui empêche une requête d'ouvrir une transaction
// Prisma démesurée, ou d'y injecter une quantité qui déborde l'`Int` de SQLite
// et fait échouer l'import en plein milieu, sans rapport exploitable.

import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_QUANTITY,
  MAX_IMPORT_ROWS,
  parseAndValidate,
} from "./import-equipment";

const ctx = {
  categories: [{ slug: "TENTE", label: "Tente" }],
  existingNames: [],
};

const csv = (lines: string[]) =>
  ["nom,categorie,quantite", ...lines].join("\n");

describe("parseAndValidate — plafond de lignes", () => {
  it("accepte un fichier à la limite exacte", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `Article ${i},Tente,1`);
    const res = parseAndValidate(csv(rows), ctx);
    expect(res.headerError).toBeUndefined();
    expect(res.rows).toHaveLength(MAX_IMPORT_ROWS);
  });

  it("rejette le fichier entier une ligne au-dessus", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Article ${i},Tente,1`);
    const res = parseAndValidate(csv(rows), ctx);
    expect(res.headerError).toContain("trop volumineux");
    expect(res.rows).toEqual([]);
  });
});

describe("parseAndValidate — bornes de quantité", () => {
  it("accepte la quantité maximale", () => {
    const res = parseAndValidate(csv([`Tente,Tente,${MAX_IMPORT_QUANTITY}`]), ctx);
    expect(res.rows[0].status).toBe("ok");
    expect(res.rows[0].quantity).toBe(MAX_IMPORT_QUANTITY);
  });

  it("refuse une quantité au-delà du plafond au lieu de la passer à Prisma", () => {
    const res = parseAndValidate(csv(["Tente,Tente,99999999999"]), ctx);
    expect(res.rows[0].status).toBe("error");
    expect(res.rows[0].message).toContain("Quantité invalide");
  });

  it("refuse toujours zéro et les valeurs négatives", () => {
    expect(parseAndValidate(csv(["Tente,Tente,0"]), ctx).rows[0].status).toBe("error");
    expect(parseAndValidate(csv(["Tente,Tente,-5"]), ctx).rows[0].status).toBe("error");
  });
});

describe("parseAndValidate — longueur des champs", () => {
  it("tronque un champ démesuré au lieu de le stocker tel quel", () => {
    const huge = "A".repeat(50_000);
    const res = parseAndValidate(csv([`${huge},Tente,1`]), ctx);
    expect(res.rows[0].name.length).toBe(500);
  });
});
