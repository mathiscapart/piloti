// #128 — invariant : la table `UnitLead` (unités encadrées, périmètre d'un
// CHEF) n'a qu'un point d'écriture, `writeLeadUnits` dans
// src/modules/admin/actions.ts, appelé par `setUserLeadUnits`, l'approbation
// et `setUserRoles` pour garder CHEF et UnitLead cohérents. Seule exception :
// l'anonymisation (RGPD), qui ne fait que supprimer. Hors `src/`, le seed et la
// migration écrivent aussi la table, avec la même règle (`leadUnitsForRoles`).
//
// Même raison d'être que roles-mirror.test.ts : un chemin d'écriture oublié
// produit un compte au périmètre incohérent avec son rôle, invisible jusqu'en
// production. Les Server Actions ne sont pas testables ici, l'invariant l'est
// statiquement.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

// Écriture directe (`tx.unitLead.create…`), imbriquée dans une écriture de
// `User` (`unitLeads: { create… }`) ou en SQL brut.
const WRITE_PATTERNS = [
  /\bunitLead\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\b/g,
  /\bunitLeads\s*:\s*\{[^}]*\b(create|createMany|connectOrCreate|connect|disconnect|set|upsert|update|updateMany|delete|deleteMany)\b/g,
  /\b(INSERT\s+(OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+"?UnitLead\b/gi,
];

function writesIn(source: string): { index: number; text: string }[] {
  return WRITE_PATTERNS.flatMap((re) =>
    [...source.matchAll(re)].map((m) => ({ index: m.index ?? 0, text: m[0] })),
  );
}

// Corps d'une fonction nommée, par appariement d'accolades.
function functionSpan(source: string, name: string): [number, number] | null {
  const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start === -1) return null;
  const open = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return [start, i];
  }
  return null;
}

const FILES = sourceFiles(SRC);
const ADMIN_ACTIONS = join(SRC, "modules", "admin", "actions.ts");
const ANONYMIZE = join(SRC, "lib", "anonymize.ts");

describe("écritures de la table UnitLead", () => {
  it("analyse bien l'arborescence des sources", () => {
    // Garde-fou : sans lui, un scanner cassé rendrait la suite vide, donc verte.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES).toContain(ADMIN_ACTIONS);
    expect(FILES).toContain(ANONYMIZE);
  });

  it("n'écrit UnitLead que dans admin/actions.ts et anonymize.ts", () => {
    const offenders = FILES.filter(
      (f) => f !== ADMIN_ACTIONS && f !== ANONYMIZE && writesIn(readFileSync(f, "utf8")).length > 0,
    ).map((f) => relative(process.cwd(), f));
    expect(
      offenders,
      `Ces fichiers écrivent UnitLead hors de writeLeadUnits (src/modules/admin/actions.ts) : CHEF et périmètre risquent de diverger.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("dans admin/actions.ts, toutes les écritures sont dans writeLeadUnits", () => {
    const source = readFileSync(ADMIN_ACTIONS, "utf8");
    const span = functionSpan(source, "writeLeadUnits");
    expect(span, "writeLeadUnits introuvable dans admin/actions.ts").not.toBeNull();
    const writes = writesIn(source);
    expect(writes.length).toBeGreaterThan(0);
    const outside = writes.filter((w) => w.index < span![0] || w.index > span![1]);
    expect(outside.map((w) => w.text)).toEqual([]);
  });

  it("l'anonymisation ne fait que supprimer", () => {
    const writes = writesIn(readFileSync(ANONYMIZE, "utf8")).map((w) => w.text.replace(/\s/g, ""));
    expect(writes).toEqual(["unitLead.deleteMany"]);
  });
});
