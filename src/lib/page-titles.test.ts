// #81 — invariant : chaque page de src/app a un titre d'onglet propre, et le
// suffixe « — Piloti » n'est écrit qu'à un endroit, le `title.template` du
// layout racine (src/app/layout.tsx). Une page exporte donc `metadata` avec un
// `title` court, fixe et sans suffixe.
//
// Titres fixes, y compris sur les routes dynamiques : un `generateMetadata`
// coûte une requête de plus, devrait redoubler le contrôle `can()` / périmètre
// de la page sous peine d'afficher un nom dans le <title> à qui n'a pas le
// droit de le voir, et met des noms (mineurs, propriétaires de lieux) dans
// l'historique d'un poste partagé. Il n'est donc admis que par exception
// explicite (GENERATE_METADATA_ALLOWED), relue en PR.
//
// Même raison d'être que datetime-usage.test.ts : une page ajoutée sans titre
// s'appelle « Piloti » comme toutes les autres, et un titre qui répète le nom
// donne « X — Piloti — Piloti ». Aucun des deux ne casse le build ni ne se voit
// à la relecture du diff, seulement dans la barre d'onglets.
//
// Analyse par regex sur le source, sans AST : suffisant pour des titres
// littéraux. Un titre calculé (variable, gabarit) n'est pas comparé.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const APP = join(ROOT, "src/app");
const ROOT_LAYOUT = "src/app/layout.tsx";

// Pages sans titre voulu, chemin relatif → pourquoi.
const EXEMPT: Record<string, string> = {
  // Ne fait que `redirect("/dashboard")` : aucun onglet n'affiche cette page.
  "src/app/page.tsx": "redirection vers /dashboard",
  // Ne fait que `notFound()` (page désactivée) : un titre « Tranches » sur une
  // 404 serait trompeur.
  "src/app/(app)/finances/tranches/page.tsx": "notFound(), page désactivée",
};

function filesNamed(dir: string, names: string[]): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return filesNamed(full, names);
    return names.includes(entry) ? [full] : [];
  });
}

const rel = (f: string) => relative(ROOT, f);
const PAGES = filesNamed(APP, ["page.tsx"]).map(rel);
const NESTED_LAYOUTS = filesNamed(APP, ["layout.tsx"])
  .map(rel)
  .filter((f) => f !== ROOT_LAYOUT);

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// Corps de `export const metadata … = { … };` (jusqu'à la fermeture de niveau 0).
function metadataBlock(source: string): string | null {
  const m = /export\s+const\s+metadata\b[^=]*=\s*\{/.exec(source);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  for (; i < source.length && depth > 0; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
  }
  return topLevel(source.slice(m.index + m[0].length, i - 1));
}

// Vide les sous-objets ({ openGraph: { title } } → { openGraph: {} }) : seul le
// `title` du premier niveau est celui de l'onglet.
function topLevel(body: string): string {
  let depth = 0;
  return [...body]
    .filter((c) => {
      if (c === "{") return depth++ === 0;
      if (c === "}") return --depth === 0;
      return depth === 0;
    })
    .join("");
}

// Pages autorisées à calculer leur titre, chemin relatif → pourquoi. Vide :
// aucune donnée dans un titre d'onglet aujourd'hui.
const GENERATE_METADATA_ALLOWED: Record<string, string> = {};

const hasGenerateMetadata = (source: string) =>
  /export\s+(async\s+)?function\s+generateMetadata\b|export\s+const\s+generateMetadata\b/.test(source);

// Littéral de `title: "…"` au premier niveau du bloc ; null si absent ou calculé.
function literalTitle(source: string): string | null {
  const block = metadataBlock(source);
  const m = block && /(?:^|[\s,])title:\s*(["'`])((?:\\.|(?!\1).)*)\1/.exec(block);
  return m ? m[2] : null;
}

// Un `title` est-il défini, littéral ou non (hors `title:` d'un sous-objet) ?
function definesTitle(source: string): boolean {
  if (hasGenerateMetadata(source)) return true;
  const block = metadataBlock(source);
  if (!block || !/(?:^|[\s,])title:\s*\S/.test(block)) return false;
  if (/(?:^|[\s,])title:\s*(undefined|null)\b/.test(block)) return false;
  // Objet ({ absolute: "X" }, {}) : `absolute` contourne le template racine.
  if (/(?:^|[\s,])title:\s*\{/.test(block)) return false;
  return literalTitle(source)?.trim() !== "";
}

describe("titres d'onglet : le détecteur du verrou", () => {
  it("lit un titre littéral", () => {
    expect(literalTitle(`export const metadata: Metadata = {\n  title: "Dons",\n};`)).toBe("Dons");
  });
  it("ignore un code sans metadata", () => {
    expect(definesTitle(`export default function P() {}`)).toBe(false);
  });
  it("refuse un titre vide", () => {
    expect(definesTitle(`export const metadata: Metadata = { title: "" };`)).toBe(false);
  });
  it("ne prend pas le title d'un sous-objet pour celui de la page", () => {
    expect(
      definesTitle(`export const metadata = { openGraph: { title: "X" }, robots: {} };`),
    ).toBe(false);
  });
  it("refuse un titre blanc ou undefined", () => {
    expect(definesTitle(`export const metadata = { title: "  " };`)).toBe(false);
    expect(definesTitle(`export const metadata = { title: undefined };`)).toBe(false);
    expect(definesTitle(`export const metadata = { title: { absolute: "X" } };`)).toBe(false);
  });
  it("voit generateMetadata", () => {
    expect(definesTitle(`export async function generateMetadata() { return {}; }`)).toBe(true);
  });
});

describe("titres d'onglet : une page = un titre, suffixe au layout racine", () => {
  it("analyse bien l'arborescence des pages", () => {
    expect(PAGES.length).toBeGreaterThan(50);
    expect(PAGES).toContain("src/app/(app)/dashboard/page.tsx");
  });

  it("le layout racine est la seule source du suffixe « — Piloti »", () => {
    expect(read(ROOT_LAYOUT)).toContain('template: "%s — Piloti"');
  });

  it("chaque page exporte metadata avec un title non vide, ou generateMetadata", () => {
    const missing = PAGES.filter((p) => !(p in EXEMPT) && !definesTitle(read(p)));
    expect(missing, "pages sans titre :\n" + missing.join("\n")).toEqual([]);
  });

  it("chaque exemption existe encore et n'a toujours pas de titre", () => {
    for (const [path, why] of Object.entries(EXEMPT)) {
      expect(PAGES, `${path} (${why}) a disparu : retirer l'exemption`).toContain(path);
      expect(
        definesTitle(read(path)),
        `${path} (${why}) définit maintenant un titre : retirer l'exemption`,
      ).toBe(false);
    }
  });

  it("aucune page ne calcule son titre sans exception déclarée", () => {
    const computed = PAGES.filter(
      (p) => !(p in GENERATE_METADATA_ALLOWED) && hasGenerateMetadata(read(p)),
    );
    expect(
      computed,
      "generateMetadata hors exception (titre fixe attendu, cf. en-tête) :\n" + computed.join("\n"),
    ).toEqual([]);
  });

  it("aucun layout imbriqué ne définit de title (il masquerait le template racine)", () => {
    const withTitle = NESTED_LAYOUTS.filter((f) => {
      const source = read(f);
      return hasGenerateMetadata(source) || /(?:^|[\s,])title:/.test(metadataBlock(source) ?? "");
    });
    expect(withTitle, "layouts avec title :\n" + withTitle.join("\n")).toEqual([]);
  });

  it("aucun titre ne répète « Piloti » (le template l'ajoute déjà)", () => {
    const repeated = PAGES.filter((f) =>
      /piloti/i.test(literalTitle(read(f)) ?? ""),
    );
    expect(repeated, "titres contenant « Piloti » :\n" + repeated.join("\n")).toEqual([]);
  });

  it("les titres littéraux sont distincts d'une page à l'autre", () => {
    const byTitle = new Map<string, string[]>();
    for (const p of PAGES) {
      const t = literalTitle(read(p));
      if (t) byTitle.set(t, [...(byTitle.get(t) ?? []), p]);
    }
    const dups = [...byTitle].filter(([, files]) => files.length > 1);
    expect(
      dups,
      dups.map(([t, files]) => `« ${t} » :\n  ${files.join("\n  ")}`).join("\n"),
    ).toEqual([]);
  });
});
