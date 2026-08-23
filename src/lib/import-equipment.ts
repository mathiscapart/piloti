// US-22 — import d'inventaire depuis un CSV (gabarit générique). Fonctions pures
// partagées entre l'aperçu client et l'import serveur (source de vérité).

import { EQUIPMENT_CONDITIONS, type EquipmentCondition } from "@/lib/enums";

// Bornes de l'import. Le CSV arrive d'un utilisateur : sans plafond, une seule
// requête pouvait ouvrir une transaction Prisma de centaines de milliers de
// lignes, et une quantité comme `99999999999` dépassait l'`Int` de SQLite —
// l'erreur survenait alors EN PLEIN milieu de la transaction, pas à la
// validation, donc sans rapport d'erreur exploitable pour l'utilisateur.
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_QUANTITY = 100_000;
const MAX_FIELD_LENGTH = 500;

// Colonnes du gabarit standard. L'ordre est libre : on mappe par en-tête.
export const IMPORT_COLUMNS = [
  "nom",
  "categorie",
  "quantite",
  "etat",
  "localisation",
  "notes",
] as const;

export const IMPORT_TEMPLATE_CSV =
  "nom,categorie,quantite,etat,localisation,notes\n" +
  "Tente Canadienne 4p,Tente,1,Bon,Local Bleus,Achat 2024\n" +
  "Réchaud à gaz,Cuisine,2,Neuf,Malle cuisine,\n";

// Libellés FR d'état tolérés à l'import → slug interne.
const CONDITION_ALIASES: Record<string, EquipmentCondition> = {
  neuf: "NEUF",
  bon: "BON",
  "bon etat": "BON",
  use: "USE",
  usee: "USE",
  use_: "USE",
  "a reparer": "A_REPARER",
  "hors service": "HORS_SERVICE",
  hs: "HORS_SERVICE",
};

// Supprime les diacritiques + minuscule, pour comparer libellés/catégories.
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Parse un CSV simple (gère les guillemets et le séparateur , ou ;).
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  // Détecte le séparateur sur la première ligne (Excel FR utilise souvent ;).
  const firstLine = clean.split("\n")[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >
    (firstLine.match(/,/g)?.length ?? 0)
    ? ";"
    : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

export type RowStatus = "ok" | "duplicate" | "error";

export interface ParsedEquipmentRow {
  line: number; // numéro de ligne (1 = première ligne de données)
  name: string;
  category: string; // slug résolu
  categoryInput: string; // valeur d'origine
  quantity: number;
  condition: EquipmentCondition;
  location?: string;
  notes?: string;
  status: RowStatus;
  message?: string; // erreur ou avertissement
}

export interface ParseResult {
  headerError?: string;
  rows: ParsedEquipmentRow[];
}

export interface ValidationContext {
  // slug → label (catégories actives)
  categories: { slug: string; label: string }[];
  existingNames: string[]; // noms d'articles déjà au catalogue (doublons)
}

// Mappe + valide les lignes d'un CSV selon le gabarit. Détecte en-têtes,
// résout les catégories, normalise l'état, repère doublons et erreurs.
export function parseAndValidate(
  csvText: string,
  ctx: ValidationContext,
): ParseResult {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { rows: [], headerError: "Fichier vide." };

  // -1 : la première ligne est l'en-tête, pas une donnée.
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      headerError: `Fichier trop volumineux : ${rows.length - 1} lignes pour un maximum de ${MAX_IMPORT_ROWS}. Découpe-le en plusieurs imports.`,
    };
  }

  const header = rows[0].map((h) => fold(h));
  const idx = (name: string) => header.indexOf(name);
  const iName = idx("nom");
  if (iName === -1) {
    return {
      rows: [],
      headerError:
        "En-tête « nom » introuvable. Utilise le gabarit (nom, categorie, quantite, etat, localisation, notes).",
    };
  }
  const iCat = idx("categorie");
  const iQty = idx("quantite");
  const iCond = idx("etat");
  const iLoc = idx("localisation");
  const iNotes = idx("notes");

  const catBySlug = new Map(ctx.categories.map((c) => [c.slug.toUpperCase(), c.slug]));
  const catByLabel = new Map(ctx.categories.map((c) => [fold(c.label), c.slug]));
  const existing = new Set(ctx.existingNames.map((n) => fold(n)));
  const seen = new Set<string>();

  const out: ParsedEquipmentRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    // Ignore les lignes entièrement vides.
    if (cells.every((c) => c.trim() === "")) continue;

    const line = r;
    // Tronque : un champ CSV est libre et peut peser des mégaoctets. On coupe
    // plutôt que de rejeter, une valeur trop longue étant presque toujours un
    // export mal formé, pas une intention de l'utilisateur.
    const cell = (i: number) =>
      (i >= 0 ? cells[i] ?? "" : "").trim().slice(0, MAX_FIELD_LENGTH);

    const name = cell(iName);
    const categoryInput = cell(iCat);
    const qtyRaw = cell(iQty);
    const condRaw = cell(iCond);
    const location = cell(iLoc);
    const notes = cell(iNotes);

    // Résolution catégorie : slug, puis libellé, sinon « Autre » (réceptacle).
    let category = "AUTRE";
    let warn: string | undefined;
    if (categoryInput) {
      const bySlug = catBySlug.get(categoryInput.toUpperCase());
      const byLabel = catByLabel.get(fold(categoryInput));
      if (bySlug) category = bySlug;
      else if (byLabel) category = byLabel;
      else {
        category = "AUTRE";
        warn = `Catégorie « ${categoryInput} » inconnue → rangée dans « Autre ».`;
      }
    }

    // Quantité.
    let quantity = 1;
    if (qtyRaw) {
      const n = Number.parseInt(qtyRaw, 10);
      if (!Number.isFinite(n) || n < 1 || n > MAX_IMPORT_QUANTITY) {
        out.push({
          line, name, category, categoryInput, quantity: 1,
          condition: "BON", location, notes, status: "error",
          message: `Quantité invalide : « ${qtyRaw} » (entre 1 et ${MAX_IMPORT_QUANTITY}).`,
        });
        continue;
      }
      quantity = n;
    }

    // État.
    let condition: EquipmentCondition = "BON";
    if (condRaw) {
      const direct = EQUIPMENT_CONDITIONS.find((c) => c === condRaw.toUpperCase());
      const alias = CONDITION_ALIASES[fold(condRaw)];
      const resolved = direct ?? alias;
      if (!resolved) {
        out.push({
          line, name, category, categoryInput, quantity,
          condition: "BON", location, notes, status: "error",
          message: `État « ${condRaw} » non reconnu.`,
        });
        continue;
      }
      condition = resolved;
    }

    if (!name) {
      out.push({
        line, name, category, categoryInput, quantity, condition,
        location, notes, status: "error", message: "Nom manquant.",
      });
      continue;
    }

    const key = fold(name);
    if (existing.has(key) || seen.has(key)) {
      out.push({
        line, name, category, categoryInput, quantity, condition,
        location, notes, status: "duplicate",
        message: "Doublon : un article du même nom existe déjà.",
      });
      continue;
    }
    seen.add(key);

    out.push({
      line, name, category, categoryInput, quantity, condition,
      location: location || undefined,
      notes: notes || undefined,
      status: "ok",
      message: warn,
    });
  }

  return { rows: out };
}
