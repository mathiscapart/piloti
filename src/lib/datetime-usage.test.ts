// #115 — invariant : src/lib/datetime.ts est le SEUL endroit qui formate une
// date ou lit ses composantes dans un fuseau. Ailleurs, aucun
// `Intl.DateTimeFormat`, `toLocale*String`, `toDateString`, getter/setter
// local (`getHours`, `setDate`…) ni `toISOString().slice(0, 10)` : chacun
// dépend du fuseau du serveur (ou, pour le dernier, tronque en UTC un instant
// réel). Même raison d'être que unit-lead-writes.test.ts : un site oublié ne se
// voit qu'en production, le jour où le fuseau du serveur change.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const MODULE = "lib/datetime.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: "Intl.DateTimeFormat", re: /\bIntl\s*\.\s*DateTimeFormat\b/ },
  { name: "toLocaleDateString / toLocaleTimeString", re: /\.toLocale(Date|Time)String\s*\(/ },
  { name: "toLocaleString", re: /\.toLocaleString\s*\(/ },
  { name: "toDateString / toTimeString", re: /\.to(Date|Time)String\s*\(/ },
  {
    name: "getter/setter dans le fuseau du serveur",
    re: /\.(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\s*\(/,
  },
  { name: "toISOString().slice/substring/split", re: /\.toISOString\(\)\s*\.\s*(slice|substring|split)\b/ },
  { name: "getTimezoneOffset", re: /\.getTimezoneOffset\s*\(/ },
  // new Date(année, mois, jour…) : composantes lues dans le fuseau du serveur.
  // new Date(Date.UTC(…)) et new Date(x.getTime() + n) restent permis.
  { name: "new Date(a, m, j) local", re: /\bnew Date\(\s*(?!Date\.UTC\b)[^()'"`]*,/ },
];

// Exceptions : chemin relatif à src → motifs tolérés, et pourquoi.
const EXCEPTIONS: Record<string, { allow: string[]; why: string }> = {
  // Nombres, pas des dates : Number.prototype.toLocaleString.
  "app/(public)/empreinte-ia/page.tsx": { allow: ["toLocaleString"], why: "nombres (kWh, litres)" },
  "modules/finance/format.ts": { allow: ["toLocaleString"], why: "montants en euros" },
  "app/(app)/finances/tranches/BracketsAdmin.tsx": { allow: ["toLocaleString"], why: "pourcentage" },
  "app/(app)/membres/[id]/BracketSelect.tsx": { allow: ["toLocaleString"], why: "pourcentage" },
  // Âge révolu (protection des mineurs) : age.test.ts fixe ses dates en
  // heure locale ; le passer en UTC changerait ses résultats. Signalé dans #115.
  "lib/legal/age.ts": {
    allow: ["getter/setter dans le fuseau du serveur"],
    why: "calcul d'âge verrouillé par age.test.ts en heure locale",
  },
  // Chemin de stockage d'un fichier (écriture, hors périmètre lecture de #115).
  "lib/upload.ts": {
    allow: ["getter/setter dans le fuseau du serveur"],
    why: "dossier AAAA/MM d'un fichier déposé, chemin écrit en base",
  },
};

const FILES = sourceFiles(SRC);

describe("dates : une seule base, src/lib/datetime.ts", () => {
  it("analyse bien l'arborescence des sources", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.map((f) => relative(SRC, f))).toContain(MODULE);
  });

  it("chaque exception existe encore et sert encore", () => {
    for (const [path, { allow }] of Object.entries(EXCEPTIONS)) {
      const source = readFileSync(join(SRC, path), "utf8");
      for (const name of allow) {
        const rule = FORBIDDEN.find((f) => f.name === name);
        expect(rule, `${path} : règle « ${name} » inconnue`).toBeDefined();
        expect(rule!.re.test(source), `${path} : exception « ${name} » devenue inutile`).toBe(true);
      }
    }
  });

  it("aucun formatage ni calcul de date dans le fuseau du serveur hors du module", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const path = relative(SRC, file);
      if (path === MODULE) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      const allowed = EXCEPTIONS[path]?.allow ?? [];
      lines.forEach((line, i) => {
        for (const { name, re } of FORBIDDEN) {
          if (!allowed.includes(name) && re.test(line)) {
            violations.push(`${path}:${i + 1} — ${name}`);
          }
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("dans le module, chaque Intl.DateTimeFormat fixe son timeZone", () => {
    const source = readFileSync(join(SRC, MODULE), "utf8");
    const calls = [...source.matchAll(/new Intl\.DateTimeFormat\(([\s\S]*?)\);/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) expect(args).toMatch(/timeZone/);
  });
});
