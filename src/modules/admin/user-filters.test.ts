import { describe, expect, it } from "vitest";

import { buildManageableUserWhere, resolveUserSort } from "./user-filters";

// Les filtres de /admin/utilisateurs viennent tous de l'URL, donc de
// l'utilisateur. Ce ne sont pas des conforts d'affichage : ce sont eux qui
// décident quelles lignes atteignent la requête. Une validation qui se dégrade
// en silence ici élargit le périmètre d'un écran d'administration sans que
// personne ne le voie.

describe("buildManageableUserWhere — périmètre des comptes", () => {
  it("s'en tient à ACTIVE et SUSPENDED par défaut", () => {
    expect(buildManageableUserWhere().status).toEqual({
      in: ["ACTIVE", "SUSPENDED"],
    });
  });

  it("accepte les deux statuts légitimes", () => {
    expect(buildManageableUserWhere({ status: "ACTIVE" }).status).toBe("ACTIVE");
    expect(buildManageableUserWhere({ status: "SUSPENDED" }).status).toBe(
      "SUSPENDED",
    );
  });

  it("refuse un statut forgé plutôt que de le transmettre", () => {
    // Sans ce repli, `?status=PENDING` exposerait les inscriptions en attente
    // depuis un écran qui n'est pas fait pour les montrer (elles vivent dans
    // /admin/inscriptions, avec leurs propres actions).
    for (const forge of ["PENDING", "REJECTED", "", "'; --"]) {
      expect(buildManageableUserWhere({ status: forge }).status).toEqual({
        in: ["ACTIVE", "SUSPENDED"],
      });
    }
  });
});

describe("buildManageableUserWhere — listes blanches", () => {
  it("filtre sur un rôle connu, guillemets compris", () => {
    // Les guillemets collent au JSON stocké dans User.roles et empêchent qu'un
    // rôle soit reconnu comme préfixe d'un autre.
    expect(buildManageableUserWhere({ role: "TRESORIER" }).roles).toEqual({
      contains: '"TRESORIER"',
    });
  });

  it("ignore un rôle inconnu au lieu de l'interpoler", () => {
    // `%` est un joker LIKE : transmis tel quel, `?role=%` ramènerait toute la
    // table alors qu'aucun rôle ne porte ce nom.
    for (const forge of ["%", "_", "ADMI", "N'IMPORTE QUOI"]) {
      expect(buildManageableUserWhere({ role: forge }).roles).toBeUndefined();
    }
  });

  it("filtre sur une unité connue et ignore les autres", () => {
    expect(buildManageableUserWhere({ unit: "SCOUTS" }).unit).toBe("SCOUTS");
    expect(buildManageableUserWhere({ unit: "%" }).unit).toBeUndefined();
  });
});

describe("buildManageableUserWhere — recherche", () => {
  const clauses = (search: string) =>
    (buildManageableUserWhere({ search }).AND ?? []) as Array<
      Record<string, unknown>
    >;

  it("exige que chaque mot matche au moins un champ", () => {
    // « marie dupont » ne matche aucune colonne prise isolément : c'est le
    // découpage par mot qui rend la recherche utilisable sur un nom complet.
    expect(clauses("marie dupont")).toHaveLength(2);
  });

  it("neutralise les jokers LIKE", () => {
    // Prisma traduit `contains` en LIKE : sans nettoyage, `%` échapperait au
    // filtrage et renverrait toute la liste.
    expect(clauses("%")).toHaveLength(0);
    expect(buildManageableUserWhere({ search: "%" }).AND).toBeUndefined();
    expect(JSON.stringify(clauses("mar%tin"))).toContain("martin");
  });

  it("plafonne le nombre de mots", () => {
    // Chaque mot ajoute un groupe OR : un `?q=` forgé de plusieurs milliers de
    // mots fabriquerait sinon une requête arbitrairement lourde.
    expect(clauses("a b c d e f g h i j k l").length).toBeLessThanOrEqual(8);
  });

  it("ne cherche pas dans l'e-mail des comptes sans connexion", () => {
    // US-CM-01 — cet e-mail est technique et masqué dans la liste : un résultat
    // fondé sur lui serait inexplicable pour l'administrateur.
    expect(JSON.stringify(clauses("marie"))).toContain('"canLogin":true');
  });

  it("ignore une recherche vide ou blanche", () => {
    for (const vide of ["", "   "]) {
      expect(buildManageableUserWhere({ search: vide }).AND).toBeUndefined();
    }
  });
});

describe("resolveUserSort", () => {
  it("accepte les tris connus", () => {
    expect(resolveUserSort("unit_desc")).toBe("unit_desc");
    expect(resolveUserSort("recent")).toBe("recent");
  });

  it("retombe sur le tri par défaut pour une clé inconnue", () => {
    // Une clé arbitraire atteignant l'`orderBy` Prisma ferait échouer la requête
    // en production sur une simple URL bricolée.
    for (const forge of [undefined, "", "password", "id"]) {
      expect(resolveUserSort(forge)).toBe("status");
    }
  });
});
