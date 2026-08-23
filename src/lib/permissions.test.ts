// Tests de src/lib/permissions.ts — source unique de la matrice de rôles.
// Toute régression ici est un problème de contrôle d'accès, pas un simple bug
// d'affichage : on verrouille en priorité le superutilisateur ADMIN, le refus
// systématique hors statut ACTIVE, le parsing de `roles` (JSON stocké en base,
// potentiellement vide ou malformé) et le garde-fou anti-élévation de
// `canAssignRole`.

import { describe, expect, it, vi } from "vitest";
import {
  assignableRoles,
  can,
  canAccessAdminZone,
  canActOnUnit,
  canAssignRole,
  effectiveRoles,
  hasRole,
  inUnitScope,
  scopedUnits,
} from "./permissions";

describe("effectiveRoles", () => {
  it("renvoie directement un tableau de rôles", () => {
    expect(effectiveRoles({ role: "CHEF", roles: ["CHEF", "TRESORIER"] })).toEqual([
      "CHEF",
      "TRESORIER",
    ]);
  });

  it("parse un JSON de tableau stocké en base (`string`)", () => {
    expect(effectiveRoles({ role: "CHEF", roles: '["CHEF","TRESORIER"]' })).toEqual([
      "CHEF",
      "TRESORIER",
    ]);
  });

  it("renvoie [] pour une chaîne vide", () => {
    expect(effectiveRoles({ role: "CHEF", roles: "" })).toEqual([]);
  });

  it("renvoie [] pour un JSON malformé, sans lever d'exception", () => {
    expect(effectiveRoles({ role: "CHEF", roles: "{pas du json" })).toEqual([]);
  });

  it("trace un avertissement (avec l'userId) pour un JSON malformé, sans changer le résultat fail-closed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      effectiveRoles({ id: "user-42", role: "CHEF", roles: "{pas du json" }),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("user-42");
    warn.mockRestore();
  });

  it("renvoie [] pour un JSON valide mais qui n'est pas un tableau", () => {
    expect(effectiveRoles({ role: "CHEF", roles: '{"role":"CHEF"}' })).toEqual([]);
  });

  it("renvoie [] quand `roles` est absent ou null", () => {
    expect(effectiveRoles({ role: "CHEF" })).toEqual([]);
    expect(effectiveRoles({ role: "CHEF", roles: null })).toEqual([]);
  });
});

describe("can — statut ACTIVE obligatoire", () => {
  it("refuse toute action si le statut n'est pas ACTIVE, même pour un ADMIN", () => {
    expect(
      can({ role: "ADMIN", roles: ["ADMIN"], status: "PENDING" }, "equipment.view"),
    ).toBe(false);
  });

  it("refuse si le statut est absent", () => {
    expect(can({ role: "ADMIN", roles: ["ADMIN"] }, "equipment.view")).toBe(false);
  });
});

describe("can — ADMIN superutilisateur", () => {
  it("autorise l'ADMIN sur une action réservée (liste de rôles vide)", () => {
    // "admin.access" n'a aucun rôle dans PERMISSIONS : réservé à l'ADMIN.
    expect(
      can({ role: "ADMIN", roles: ["ADMIN"], status: "ACTIVE" }, "admin.access"),
    ).toBe(true);
  });

  it("autorise l'ADMIN même si son rôle principal (miroir) est différent", () => {
    // US-32 : `role` n'est qu'un affichage, seul `roles` (union) fait foi.
    expect(
      can({ role: "PARENT", roles: ["ADMIN"], status: "ACTIVE" }, "admin.access"),
    ).toBe(true);
  });

  it("n'accorde AUCUN droit à un `role` miroir ADMIN dont `roles` est vide", () => {
    // Cas réel du premier déploiement en prod : `/setup` écrivait le miroir
    // `role: "ADMIN"` sans alimenter `roles`, laissant un administrateur
    // affiché comme tel mais sans le moindre droit — et sans recours, puisque
    // seul "admin.access" permet d'attribuer des rôles. Le miroir ne doit
    // jamais servir de repli : la lecture reste fail-closed.
    const mirrorOnly = { role: "ADMIN", roles: "[]", status: "ACTIVE" as const };
    expect(effectiveRoles(mirrorOnly)).toEqual([]);
    expect(can(mirrorOnly, "admin.access")).toBe(false);
    expect(can(mirrorOnly, "user.manage")).toBe(false);
    // ...tout en gardant les actions ouvertes à tout compte actif.
    expect(can(mirrorOnly, "event.view")).toBe(true);
  });
});

describe("can — ANY_ACTIVE (ouvert à tout utilisateur actif)", () => {
  it("autorise event.view / task.view / donation.create sans rôle particulier", () => {
    const user = { role: "SCOUT", roles: [], status: "ACTIVE" as const };
    expect(can(user, "event.view")).toBe(true);
    expect(can(user, "task.view")).toBe(true);
    expect(can(user, "donation.create")).toBe(true);
  });
});

describe("can — refus par défaut", () => {
  it("refuse une action de mutation à un rôle qui n'y figure pas", () => {
    expect(
      can({ role: "PARENT", roles: ["PARENT"], status: "ACTIVE" }, "equipment.create"),
    ).toBe(false);
  });

  it("autorise un rôle explicitement listé", () => {
    expect(
      can({ role: "CHEF", roles: ["CHEF"], status: "ACTIVE" }, "equipment.create"),
    ).toBe(true);
  });
});

describe("can — loan.create conditionné par la branche (US-32)", () => {
  it("autorise un SCOUT des branches Pionniers/Compagnons à créer un prêt", () => {
    expect(
      can(
        { role: "SCOUT", roles: ["SCOUT"], status: "ACTIVE", unit: "PIONNIERS" },
        "loan.create",
      ),
    ).toBe(true);
    expect(
      can(
        { role: "SCOUT", roles: ["SCOUT"], status: "ACTIVE", unit: "COMPAGNONS" },
        "loan.create",
      ),
    ).toBe(true);
  });

  it("refuse un SCOUT d'une autre branche", () => {
    expect(
      can(
        { role: "SCOUT", roles: ["SCOUT"], status: "ACTIVE", unit: "LOUVETEAUX" },
        "loan.create",
      ),
    ).toBe(false);
  });

  it("refuse un SCOUT de branche autorisée sans `unit` renseignée", () => {
    expect(can({ role: "SCOUT", roles: ["SCOUT"], status: "ACTIVE" }, "loan.create")).toBe(
      false,
    );
  });
});

describe("can — SAFE-02 modération de contenu", () => {
  it("moderation.view : CHEF et RESPONSABLE_GROUPE consultent la file", () => {
    expect(can({ role: "CHEF", roles: ["CHEF"], status: "ACTIVE" }, "moderation.view")).toBe(
      true,
    );
    expect(
      can(
        { role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE"], status: "ACTIVE" },
        "moderation.view",
      ),
    ).toBe(true);
  });

  it("moderation.review : CHEF et RESPONSABLE_GROUPE traitent la file", () => {
    expect(can({ role: "CHEF", roles: ["CHEF"], status: "ACTIVE" }, "moderation.review")).toBe(
      true,
    );
    expect(
      can(
        { role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE"], status: "ACTIVE" },
        "moderation.review",
      ),
    ).toBe(true);
  });

  it("un rôle sans aucun lien avec la modération n'a ni vue ni traitement", () => {
    const parent = { role: "PARENT", roles: ["PARENT"], status: "ACTIVE" as const };
    expect(can(parent, "moderation.view")).toBe(false);
    expect(can(parent, "moderation.review")).toBe(false);
  });
});

describe("hasRole", () => {
  it("détecte un rôle additionnel comme un rôle principal", () => {
    const user = { role: "PARENT", roles: ["PARENT", "TRESORIER"] };
    expect(hasRole(user, "TRESORIER")).toBe(true);
    expect(hasRole(user, "SECRETAIRE")).toBe(false);
  });
});

describe("canAccessAdminZone", () => {
  it("ouvre la zone admin dès qu'une seule rubrique est accessible (SECRETAIRE)", () => {
    expect(
      canAccessAdminZone({ role: "SECRETAIRE", roles: ["SECRETAIRE"], status: "ACTIVE" }),
    ).toBe(true);
  });

  it("ferme la zone admin à un rôle sans aucune rubrique", () => {
    expect(canAccessAdminZone({ role: "PARENT", roles: ["PARENT"], status: "ACTIVE" })).toBe(
      false,
    );
  });
});

describe("canAssignRole — garde-fou anti-élévation de privilèges (US-32)", () => {
  it("l'ADMIN peut attribuer n'importe quel rôle, y compris ADMIN/RG", () => {
    const admin = { role: "ADMIN", roles: ["ADMIN"], status: "ACTIVE" as const };
    expect(canAssignRole(admin, "ADMIN")).toBe(true);
    expect(canAssignRole(admin, "RESPONSABLE_GROUPE")).toBe(true);
  });

  it("un non-ADMIN (ex. SECRETAIRE) ne peut pas attribuer ADMIN ni RESPONSABLE_GROUPE", () => {
    const sec = { role: "SECRETAIRE", roles: ["SECRETAIRE"], status: "ACTIVE" as const };
    expect(canAssignRole(sec, "ADMIN")).toBe(false);
    expect(canAssignRole(sec, "RESPONSABLE_GROUPE")).toBe(false);
  });

  it("un non-ADMIN peut attribuer les autres rôles", () => {
    const sec = { role: "SECRETAIRE", roles: ["SECRETAIRE"], status: "ACTIVE" as const };
    expect(canAssignRole(sec, "CHEF")).toBe(true);
    expect(canAssignRole(sec, "TRESORIER")).toBe(true);
  });
});

describe("assignableRoles", () => {
  it("filtre les rôles privilégiés du catalogue pour un non-ADMIN", () => {
    const sec = { role: "SECRETAIRE", roles: ["SECRETAIRE"], status: "ACTIVE" as const };
    const catalog = ["CHEF", "ADMIN", "RESPONSABLE_GROUPE", "TRESORIER"] as const;
    expect(assignableRoles(sec, catalog)).toEqual(["CHEF", "TRESORIER"]);
  });

  it("ne filtre rien pour un ADMIN", () => {
    const admin = { role: "ADMIN", roles: ["ADMIN"], status: "ACTIVE" as const };
    const catalog = ["CHEF", "ADMIN", "RESPONSABLE_GROUPE", "TRESORIER"] as const;
    expect(assignableRoles(admin, catalog)).toEqual(catalog);
  });
});

describe("inUnitScope — périmètre d'unité", () => {
  const chefLouveteaux = {
    role: "CHEF",
    roles: ["CHEF"],
    unit: "LOUVETEAUX",
    status: "ACTIVE" as const,
  };

  it("borne un CHEF à sa propre branche", () => {
    expect(inUnitScope(chefLouveteaux, "LOUVETEAUX")).toBe(true);
    expect(inUnitScope(chefLouveteaux, "SCOUTS")).toBe(false);
  });

  it("ne borne ni l'ADMIN ni le RESPONSABLE_GROUPE", () => {
    const admin = { role: "ADMIN", roles: ["ADMIN"], unit: null, status: "ACTIVE" as const };
    const rg = {
      role: "RESPONSABLE_GROUPE",
      roles: ["RESPONSABLE_GROUPE"],
      unit: "ADULTES",
      status: "ACTIVE" as const,
    };
    expect(inUnitScope(admin, "SCOUTS")).toBe(true);
    expect(inUnitScope(admin, null)).toBe(true);
    expect(inUnitScope(rg, "SCOUTS")).toBe(true);
  });

  it("fail-closed : un CHEF sans unité n'encadre aucune branche", () => {
    const sansUnite = { role: "CHEF", roles: ["CHEF"], unit: null, status: "ACTIVE" as const };
    expect(inUnitScope(sansUnite, "LOUVETEAUX")).toBe(false);
    // Deux comptes sans unité ne « matchent » pas entre eux.
    expect(inUnitScope(sansUnite, null)).toBe(false);
  });

  it("fail-closed : une ressource sans unité n'est à personne (hors ADMIN/RG)", () => {
    expect(inUnitScope(chefLouveteaux, null)).toBe(false);
  });

  it("cumul de rôles : le rôle non borné l'emporte", () => {
    const chefEtRg = {
      role: "CHEF",
      roles: ["CHEF", "RESPONSABLE_GROUPE"],
      unit: "LOUVETEAUX",
      status: "ACTIVE" as const,
    };
    expect(inUnitScope(chefEtRg, "SCOUTS")).toBe(true);
  });
});

describe("scopedUnits", () => {
  const catalog = ["FARFADETS", "LOUVETEAUX", "SCOUTS", "PIONNIERS"] as const;

  it("ne renvoie que sa branche pour un CHEF", () => {
    expect(
      scopedUnits(
        { role: "CHEF", roles: ["CHEF"], unit: "SCOUTS", status: "ACTIVE" },
        catalog,
      ),
    ).toEqual(["SCOUTS"]);
  });

  it("renvoie tout le catalogue pour un ADMIN (périmètre complet)", () => {
    expect(
      scopedUnits({ role: "ADMIN", roles: ["ADMIN"], unit: null, status: "ACTIVE" }, catalog),
    ).toEqual([...catalog]);
  });

  it("renvoie [] pour un CHEF sans unité — aucun périmètre", () => {
    expect(
      scopedUnits({ role: "CHEF", roles: ["CHEF"], unit: null, status: "ACTIVE" }, catalog),
    ).toEqual([]);
  });
});

describe("canActOnUnit — périmètre conscient du rôle qui porte le droit", () => {
  const chefScouts = {
    role: "CHEF",
    roles: ["CHEF"],
    unit: "SCOUTS",
    status: "ACTIVE" as const,
  };

  it("borne un CHEF sur une action qui n'appartient qu'aux chefs", () => {
    expect(canActOnUnit(chefScouts, "event.manage", "SCOUTS")).toBe(true);
    expect(canActOnUnit(chefScouts, "event.manage", "PIONNIERS")).toBe(false);
  });

  it("borne un CHEF sur le budget d'un événement d'une autre branche", () => {
    expect(canActOnUnit(chefScouts, "budget.manage", "SCOUTS")).toBe(true);
    expect(canActOnUnit(chefScouts, "budget.manage", "PIONNIERS")).toBe(false);
  });

  it("ne borne PAS le TRÉSORIER, rôle transverse, sur le budget", () => {
    // Le cas qui casserait la trésorerie : le trésorier n'a pas d'unité et doit
    // pouvoir encaisser pour toutes les branches.
    const tresorier = {
      role: "TRESORIER",
      roles: ["TRESORIER"],
      unit: null,
      status: "ACTIVE" as const,
    };
    expect(canActOnUnit(tresorier, "budget.manage", "PIONNIERS")).toBe(true);
    expect(canActOnUnit(tresorier, "budget.manage", "SCOUTS")).toBe(true);
  });

  it("un CHEF qui est AUSSI trésorier n'est pas borné sur le budget…", () => {
    const chefEtTresorier = {
      role: "CHEF",
      roles: ["CHEF", "TRESORIER"],
      unit: "SCOUTS",
      status: "ACTIVE" as const,
    };
    expect(canActOnUnit(chefEtTresorier, "budget.manage", "PIONNIERS")).toBe(true);
    // …mais le reste borné sur une action réservée aux seuls chefs.
    expect(canActOnUnit(chefEtTresorier, "event.manage", "PIONNIERS")).toBe(false);
  });

  it("borne un CHEF sur le référentiel d'étapes d'une autre branche", () => {
    // Archiver l'étape d'une autre branche la retire de la progression affichée
    // à ses jeunes (`listSteps` filtre `archived: false`) : c'est une écriture
    // sur le parcours d'une unité qu'on n'encadre pas.
    expect(canActOnUnit(chefScouts, "pedago.referential", "SCOUTS")).toBe(true);
    expect(canActOnUnit(chefScouts, "pedago.referential", "PIONNIERS")).toBe(false);
  });

  it("refuse d'abord sur la permission de rôle, avant toute question d'unité", () => {
    const parent = {
      role: "PARENT",
      roles: ["PARENT"],
      unit: "SCOUTS",
      status: "ACTIVE" as const,
    };
    expect(canActOnUnit(parent, "event.manage", "SCOUTS")).toBe(false);
  });

  it("n'entrave pas les actions ouvertes à tout compte actif", () => {
    expect(canActOnUnit(chefScouts, "event.view", "PIONNIERS")).toBe(true);
  });
});

// Rattachement familial parent ↔ jeune. La permission est volontairement
// SÉPARÉE de `user.manage` (qui ouvre l'attribution des rôles) : ce test
// verrouille la séparation, car les fusionner rendrait tout CHEF capable de
// changer les rôles des comptes.
describe("can — member.family.manage", () => {
  const active = (roles: string[]) =>
    ({ role: roles[0] ?? "SCOUT", roles, status: "ACTIVE" }) as const;

  it.each([["CHEF"], ["RESPONSABLE_GROUPE"], ["SECRETAIRE"]])(
    "autorise %s à gérer les rattachements familiaux",
    (role) => {
      expect(can(active([role]), "member.family.manage")).toBe(true);
    },
  );

  it("autorise l'ADMIN (superutilisateur)", () => {
    expect(can(active(["ADMIN"]), "member.family.manage")).toBe(true);
  });

  it.each([["PARENT"], ["SCOUT"], ["TRESORIER"], ["RESPONSABLE_MATERIEL"]])(
    "refuse %s",
    (role) => {
      expect(can(active([role]), "member.family.manage")).toBe(false);
    },
  );

  it("n'accorde PAS `user.manage` au CHEF (pas d'élévation de privilèges)", () => {
    expect(can(active(["CHEF"]), "member.family.manage")).toBe(true);
    expect(can(active(["CHEF"]), "user.manage")).toBe(false);
  });

  it("refuse un CHEF dont le compte n'est pas ACTIVE", () => {
    expect(
      can({ role: "CHEF", roles: ["CHEF"], status: "PENDING" }, "member.family.manage"),
    ).toBe(false);
  });
});
