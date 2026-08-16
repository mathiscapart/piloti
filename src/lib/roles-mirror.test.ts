// Invariant du modèle de rôles unifié (US-32) : `roles` (JSON) est la source de
// vérité des permissions, `role` n'est qu'un miroir d'affichage. Toute écriture
// Prisma qui positionne le miroir DOIT donc positionner la source.
//
// Ce test existe à cause d'un incident réel : `/setup` écrivait `role: "ADMIN"`
// sans `roles`, ce qui a produit en production un premier administrateur affiché
// « Administrateur » mais dépourvu de tout droit — et irrécupérable depuis l'UI,
// puisque seul un compte ayant "admin.access" peut attribuer des rôles.
//
// On analyse les sources plutôt que d'exercer les Server Actions : celles-ci ne
// sont pas testables ici (Prisma, better-auth), alors que l'invariant, lui, est
// vérifiable statiquement.

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

/**
 * Contenu de chaque bloc `data: { … }`, par appariement d'accolades — plus sûr
 * qu'une expression régulière, qui s'arrêterait au premier objet imbriqué.
 */
function dataBlocks(source: string): string[] {
  const blocks: string[] = [];
  const opener = /\bdata:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(source)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;

    for (let i = start; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          blocks.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return blocks;
}

const FILES = sourceFiles(SRC);

describe("écritures Prisma du couple role / roles", () => {
  it("analyse bien l'arborescence des sources", () => {
    // Garde-fou : sans lui, un scanner cassé rendrait la suite vide, donc verte.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.some((f) => f.endsWith(join("setup", "actions.ts")))).toBe(true);
    expect(FILES.flatMap((f) => dataBlocks(readFileSync(f, "utf8"))).length).toBeGreaterThan(20);
  });

  it("ne laisse aucun `data: { role: … }` sans `roles`", () => {
    const offenders = FILES.filter((file) =>
      dataBlocks(readFileSync(file, "utf8")).some(
        (block) => /\brole\s*:/.test(block) && !/\broles\s*:/.test(block),
      ),
    ).map((file) => relative(process.cwd(), file));

    // Message explicite : c'est le miroir seul qui est interdit, pas `role`.
    expect(
      offenders,
      `Ces fichiers écrivent le miroir \`role\` sans la source \`roles\` : un compte y perdrait tous ses droits.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
