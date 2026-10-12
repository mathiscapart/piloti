// #115 — invariant : src/lib/datetime.ts est le SEUL endroit qui formate une
// date ou lit ses composantes dans un fuseau. Ailleurs, aucun
// `Intl.DateTimeFormat`, `toLocale*String`, `toDateString`, getter/setter
// local (`getHours`, `setDate`…), `new Date(a, m, j)`, chaîne date-heure sans
// fuseau ni `toISOString().slice(0, 10)` : chacun dépend du fuseau du serveur
// (ou, pour le dernier, tronque en UTC un instant réel). Même raison d'être que
// unit-lead-writes.test.ts : un site oublié ne se voit qu'en production, le
// jour où le fuseau du serveur change.
//
// Chaque fichier est analysé en entier (pas ligne par ligne) : un appel coupé
// par Prettier sur plusieurs lignes est détecté, le numéro de ligne est
// recalculé depuis la position.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCANNED_DIRS = ["src", "prisma", "scripts", "public"];
const MODULE = "src/lib/datetime.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.(tsx?|m?js)$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

function endOf(source: string, marker: string, from: number): number {
  const end = source.indexOf(marker, from);
  return end < 0 ? source.length : end;
}

// new Date(a, m, j…) : composantes lues dans le fuseau du serveur. On compte les
// virgules au premier niveau des arguments, en sautant parenthèses imbriquées,
// chaînes et commentaires : new Date(Number(y), m - 1, d) est détecté,
// new Date(Date.UTC(…)), new Date(x.getTime() + n) et la virgule finale de
// Prettier (new Date(\n  x,\n)) restent permis.
function localDateConstructors(source: string): number[] {
  const hits: number[] = [];
  for (const m of source.matchAll(/\bnew\s+Date\s*\(/g)) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = m.index + m[0].length; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (source.startsWith("//", i)) i = endOf(source, "\n", i);
      else if (source.startsWith("/*", i)) i = endOf(source, "*/", i) + 1;
      else if (c === '"' || c === "'" || c === "`") quote = c;
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) {
        if (/^\s*\)/.test(source.slice(i + 1, i + 200))) continue;
        hits.push(m.index);
        break;
      }
    }
  }
  return hits;
}

function regexRule(re: RegExp) {
  return (source: string) => [...source.matchAll(re)].map((m) => m.index);
}

const FORBIDDEN: { name: string; find: (source: string) => number[] }[] = [
  { name: "Intl.DateTimeFormat", find: regexRule(/\bIntl\s*\.\s*DateTimeFormat\b/g) },
  {
    name: "toLocaleDateString / toLocaleTimeString",
    find: regexRule(/\.toLocale(Date|Time)String\s*\(/g),
  },
  { name: "toLocaleString", find: regexRule(/\.toLocaleString\s*\(/g) },
  { name: "toDateString / toTimeString", find: regexRule(/\.to(Date|Time)String\s*\(/g) },
  {
    name: "getter/setter dans le fuseau du serveur",
    find: regexRule(/\.(get|set)(FullYear|Year|Month|Date|Day|Hours|Minutes|Seconds)\s*\(/g),
  },
  {
    name: "toISOString().slice/substring/substr/split",
    find: regexRule(/\.toISOString\(\s*\)\s*\??\.\s*(slice|substring|substr|split)\b/g),
  },
  { name: "getTimezoneOffset", find: regexRule(/\.getTimezoneOffset\s*\(/g) },
  { name: "new Date(a, m, j) local", find: localDateConstructors },
  // "2026-10-12T14:00" sans Z ni décalage : lue dans le fuseau du serveur.
  // Une date seule ("2026-10-12") est lue en UTC et reste permise. Seules les
  // chaînes écrites dans l'appel sont vues : littéral, gabarit (`${d}T${h}:00`)
  // ou concaténation (d + "T14:00"). Une valeur venue d'ailleurs (champ
  // datetime-local d'un formulaire) échappe à toute analyse statique.
  {
    name: "chaîne date-heure sans fuseau",
    find: (source) => [
      ...regexRule(
        /\b(?:new\s+Date|Date\.parse)\s*\(\s*(["'`])[^"'`]*?[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\1/g,
      )(source),
      ...regexRule(
        /\b(?:new\s+Date|Date\.parse)\s*\(\s*`[^`]*T\$\{[^`]*(?<!Z|[+-]\d{2}:\d{2})`/g,
      )(source),
      ...regexRule(
        /\b(?:new\s+Date|Date\.parse)\s*\([^()]*?\+\s*(["'`])T[^"'`]*(?<!Z|[+-]\d{2}:\d{2})\1/g,
      )(source),
    ],
  },
];

// Exceptions : chemin relatif à la racine → nombre exact d'occurrences tolérées
// par règle, et pourquoi. Le nombre est exact : un appel de plus dans un fichier
// d'exception fait échouer le verrou.
const EXCEPTIONS: Record<string, { allow: Record<string, number>; why: string }> = {
  // Nombres, pas des dates : Number.prototype.toLocaleString.
  "src/app/(public)/empreinte-ia/page.tsx": {
    allow: { toLocaleString: 7 },
    why: "nombres (kWh, litres)",
  },
  "src/modules/finance/format.ts": { allow: { toLocaleString: 1 }, why: "montants en euros" },
  "src/app/(app)/finances/tranches/BracketsAdmin.tsx": {
    allow: { toLocaleString: 1 },
    why: "pourcentage",
  },
  "src/app/(app)/membres/[id]/BracketSelect.tsx": {
    allow: { toLocaleString: 1 },
    why: "pourcentage",
  },
  // Âge révolu (protection des mineurs) : age.test.ts fixe ses dates en
  // heure locale ; le passer en UTC changerait ses résultats. Signalé dans #115.
  "src/lib/legal/age.ts": {
    allow: { "getter/setter dans le fuseau du serveur": 8 },
    why: "calcul d'âge verrouillé par age.test.ts en heure locale",
  },
  // Chemin de stockage d'un fichier (écriture, hors périmètre lecture de #115).
  "src/lib/upload.ts": {
    allow: { "getter/setter dans le fuseau du serveur": 2 },
    why: "dossier AAAA/MM d'un fichier déposé, chemin écrit en base",
  },
};

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function violationsIn(source: string, allowed: string[] = []): string[] {
  return FORBIDDEN.filter(({ name }) => !allowed.includes(name)).flatMap(({ name, find }) =>
    find(source).map((index) => `${lineOf(source, index)} — ${name}`),
  );
}

const FILES = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((f) =>
  relative(ROOT, f),
);

describe("dates : le détecteur du verrou", () => {
  it.each([
    ["Intl.DateTimeFormat", `new Intl.DateTimeFormat("fr-FR", {})`],
    ["toLocaleDateString / toLocaleTimeString", `d.toLocaleDateString("fr-FR")`],
    ["toLocaleString", `d.toLocaleString()`],
    ["toDateString / toTimeString", `d.toDateString()`],
    ["getter/setter dans le fuseau du serveur", `d.getHours()`],
    ["getter/setter dans le fuseau du serveur", `d.getYear()`],
    ["getter/setter dans le fuseau du serveur", `d.setDate(1)`],
    ["toISOString().slice/substring/substr/split", `d.toISOString().slice(0, 10)`],
    ["toISOString().slice/substring/substr/split", `d.toISOString().substr(0, 10)`],
    ["toISOString().slice/substring/substr/split", `d.toISOString().split("T")[0]`],
    // Coupé par Prettier sur deux lignes.
    ["toISOString().slice/substring/substr/split", `someLongName\n  .toISOString()\n  .slice(0, 10)`],
    ["getTimezoneOffset", `d.getTimezoneOffset()`],
    ["new Date(a, m, j) local", `new Date(2026, 2, 29)`],
    ["new Date(a, m, j) local", `new Date(Number(y), m - 1, d)`],
    ["new Date(a, m, j) local", `new Date(\n  parseInt(parts[0], 10),\n  0,\n)`],
    ["chaîne date-heure sans fuseau", `new Date("2026-10-12T14:00")`],
    ["chaîne date-heure sans fuseau", `new Date('2026-10-12T14:00:30.5')`],
    ["chaîne date-heure sans fuseau", `new Date("2026-10-12 14:00")`],
    ["chaîne date-heure sans fuseau", `Date.parse("2026-10-12T14:00")`],
    ["chaîne date-heure sans fuseau", "new Date(`${day}T00:00`)"],
    ["chaîne date-heure sans fuseau", "new Date(`${day}T${hh}:${mm}`)"],
    ["chaîne date-heure sans fuseau", `new Date(day + "T14:00")`],
    // Apostrophe dans un commentaire : ne doit pas ouvrir une chaîne.
    ["new Date(a, m, j) local", `new Date( // l'an\n  y, m, 1); const s = 'z';`],
  ])("détecte « %s » dans %j", (name, code) => {
    expect(violationsIn(code).map((v) => v.split(" — ")[1])).toContain(name);
  });

  it.each([
    `new Date()`,
    `new Date(Date.UTC(y, m - 1, d))`,
    `new Date(Date.UTC(Number(y), m - 1, d, 12, 0))`,
    `new Date(x.getTime() + 3600 * 1000)`,
    `new Date(todayInput())`,
    `new Date(Math.max(a, b))`,
    `new Date(f("a, b"))`,
    `new Date("2026-10-12")`,
    "new Date(`${y}-05-15`)",
    `new Date("2026-10-12T14:00Z")`,
    `new Date("2026-10-12T14:00:00.000Z")`,
    `new Date("2026-10-12T14:00+02:00")`,
    `d.toISOString()`,
    `d.getUTCHours() + d.getUTCFullYear()`,
    `"abc".substr(1)`,
    // Virgule finale ajoutée par Prettier : un seul argument.
    `new Date(\n  someVeryLongExpression,\n)`,
    // Virgule dans un commentaire, pas entre deux arguments.
    `new Date(x /* a, b */)`,
    `new Date(x // a, b\n)`,
    "new Date(`${day}T${hh}:${mm}Z`)",
    "new Date(`${day}T${hh}:00+02:00`)",
    `new Date(day + "T14:00Z")`,
  ])("laisse passer %j", (code) => {
    expect(violationsIn(code)).toEqual([]);
  });

  it("calcule le numéro de ligne depuis la position", () => {
    expect(violationsIn(`const a = 1;\n\nconst h = d\n  .getHours();`)).toEqual([
      "4 — getter/setter dans le fuseau du serveur",
    ]);
  });
});

describe("dates : une seule base, src/lib/datetime.ts", () => {
  it("analyse bien l'arborescence des sources", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES).toContain(MODULE);
    expect(FILES).toContain("prisma/seed.ts");
    expect(FILES).toContain("public/sw.js");
    expect(FILES).toContain("scripts/gen-icons.mjs");
  });

  it("chaque exception existe encore et garde son nombre exact d'occurrences", () => {
    for (const [path, { allow }] of Object.entries(EXCEPTIONS)) {
      const source = readFileSync(join(ROOT, path), "utf8");
      for (const [name, count] of Object.entries(allow)) {
        const rule = FORBIDDEN.find((f) => f.name === name);
        expect(rule, `${path} : règle « ${name} » inconnue`).toBeDefined();
        expect(rule!.find(source).length, `${path} : exception « ${name} »`).toBe(count);
      }
    }
  });

  it("aucun formatage ni calcul de date dans le fuseau du serveur hors du module", () => {
    const violations = FILES.filter((path) => path !== MODULE).flatMap((path) =>
      violationsIn(
        readFileSync(join(ROOT, path), "utf8"),
        Object.keys(EXCEPTIONS[path]?.allow ?? {}),
      ).map((v) => `${path}:${v}`),
    );
    expect(violations).toEqual([]);
  });

  it("dans le module, chaque Intl.DateTimeFormat fixe son timeZone", () => {
    const source = readFileSync(join(ROOT, MODULE), "utf8");
    const calls = [...source.matchAll(/new Intl\.DateTimeFormat\(([\s\S]*?)\);/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) expect(args).toMatch(/timeZone/);
  });
});
