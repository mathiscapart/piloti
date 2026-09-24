// Tests de src/lib/permissions.ts — source unique de la matrice de rôles.
// Toute régression ici est un problème de contrôle d'accès, pas un simple bug
// d'affichage : on verrouille en priorité le superutilisateur ADMIN, le refus
// systématique hors statut ACTIVE, le parsing de `roles` (JSON stocké en base,
// potentiellement vide ou malformé) et le garde-fou anti-élévation de
// `canAssignRole`.

import { describe, expect, it, vi } from "vitest";
import {
  ACTIONS,
  assignableRoles,
  can,
  canAccessAdminZone,
  canActOnUnit,
  canAssignRole,
  canManagePlace,
  canReadPedagoNotes,
  canReviewExpense,
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

describe("can — message.manage_any (#92)", () => {
  it("seuls l'ADMIN et le RG modifient ou suppriment le message d'un autre (#173)", () => {
    for (const role of ["ADMIN", "RESPONSABLE_GROUPE"]) {
      expect(can({ role, roles: [role], status: "ACTIVE" }, "message.manage_any")).toBe(true);
    }
    for (const role of ["CHEF", "PARENT", "SCOUT"]) {
      expect(can({ role, roles: [role], status: "ACTIVE" }, "message.manage_any")).toBe(false);
    }
  });
});

describe("can — announcement.manage_any (#111)", () => {
  it("seuls l'ADMIN et le RG gèrent l'annonce d'un autre (lecteurs, relance, suppression, #173)", () => {
    for (const role of ["ADMIN", "RESPONSABLE_GROUPE"]) {
      expect(can({ role, roles: [role], status: "ACTIVE" }, "announcement.manage_any")).toBe(true);
    }
    for (const role of ["CHEF", "PARENT", "SCOUT"]) {
      expect(can({ role, roles: [role], status: "ACTIVE" }, "announcement.manage_any")).toBe(
        false,
      );
    }
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

describe("canActOnUnit — rattachement familial borné à la branche du jeune (#83)", () => {
  const chef = (unit: string | null) =>
    ({ role: "CHEF", roles: ["CHEF"], unit, status: "ACTIVE" as const });
  const active = (roles: string[]) =>
    ({ role: roles[0], roles, unit: null, status: "ACTIVE" as const });

  it("autorise un chef sur un jeune de sa branche", () => {
    expect(canActOnUnit(chef("PIONNIERS"), "member.family.manage", "PIONNIERS")).toBe(true);
  });

  it("refuse un chef sur un jeune d'une autre branche", () => {
    expect(canActOnUnit(chef("PIONNIERS"), "member.family.manage", "COMPAGNONS")).toBe(false);
  });

  it("fail-closed : chef sans branche, ou jeune sans branche", () => {
    expect(canActOnUnit(chef(null), "member.family.manage", "PIONNIERS")).toBe(false);
    expect(canActOnUnit(chef("PIONNIERS"), "member.family.manage", null)).toBe(false);
  });

  it.each([["SECRETAIRE"], ["RESPONSABLE_GROUPE"], ["ADMIN"]])(
    "ne borne pas %s, quelle que soit la branche",
    (role) => {
      expect(canActOnUnit(active([role]), "member.family.manage", "COMPAGNONS")).toBe(true);
      expect(canActOnUnit(active([role]), "member.family.manage", null)).toBe(true);
    },
  );

  it("ne borne pas un compte CHEF + SECRÉTAIRE", () => {
    const chefSec = { role: "CHEF", roles: ["CHEF", "SECRETAIRE"], unit: "PIONNIERS", status: "ACTIVE" as const };
    expect(canActOnUnit(chefSec, "member.family.manage", "COMPAGNONS")).toBe(true);
  });
});

describe("canReadPedagoNotes — notes de suivi sensibles (US-S07, #98)", () => {
  const user = (roles: string[], unit: string | null = null, status = "ACTIVE" as const) =>
    ({ role: roles[0], roles, unit, status });

  it("autorise un chef de la branche du jeune", () => {
    expect(canReadPedagoNotes(user(["CHEF"], "PIONNIERS"), "PIONNIERS")).toBe(true);
  });

  it("refuse un chef d'une autre branche", () => {
    expect(canReadPedagoNotes(user(["CHEF"], "SCOUTS"), "PIONNIERS")).toBe(false);
  });

  it("fail-closed : chef sans branche, ou jeune sans branche", () => {
    expect(canReadPedagoNotes(user(["CHEF"], null), "PIONNIERS")).toBe(false);
    expect(canReadPedagoNotes(user(["CHEF"], "PIONNIERS"), null)).toBe(false);
  });

  it("autorise l'ADMIN quelle que soit la branche", () => {
    expect(canReadPedagoNotes(user(["ADMIN"]), "PIONNIERS")).toBe(true);
  });

  it("refuse le RG, qui a pourtant pedago.view et pedago.manage (#173)", () => {
    expect(can(user(["RESPONSABLE_GROUPE"]), "pedago.manage")).toBe(true);
    expect(canReadPedagoNotes(user(["RESPONSABLE_GROUPE"]), "PIONNIERS")).toBe(false);
  });

  it("un RG aussi chef ne lit que les notes de SA branche, comme un chef (#173)", () => {
    const rgChef = user(["RESPONSABLE_GROUPE", "CHEF"], "SCOUTS");
    expect(canReadPedagoNotes(rgChef, "SCOUTS")).toBe(true);
    expect(canReadPedagoNotes(rgChef, "PIONNIERS")).toBe(false);
  });

  it.each([["PARENT"], ["SCOUT"], ["TRESORIER"], ["SECRETAIRE"]])("refuse %s", (role) => {
    expect(canReadPedagoNotes(user([role], "PIONNIERS"), "PIONNIERS")).toBe(false);
  });

  it("refuse un chef de la branche dont le compte n'est pas actif", () => {
    expect(
      canReadPedagoNotes({ role: "CHEF", roles: ["CHEF"], unit: "PIONNIERS", status: "SUSPENDED" }, "PIONNIERS"),
    ).toBe(false);
  });
});

describe("pedago.validation.cancel — annuler une étape confirmée (#100)", () => {
  const user = (roles: string[], unit: string | null = null) =>
    ({ role: roles[0], roles, unit, status: "ACTIVE" as const });

  it.each([["RESPONSABLE_GROUPE"], ["ADMIN"]])("autorise %s", (role) => {
    expect(can(user([role]), "pedago.validation.cancel")).toBe(true);
  });

  it("refuse un chef, même de la branche (il a pourtant pedago.manage)", () => {
    expect(can(user(["CHEF"], "PIONNIERS"), "pedago.manage")).toBe(true);
    expect(can(user(["CHEF"], "PIONNIERS"), "pedago.validation.cancel")).toBe(false);
  });

  it.each([["PARENT"], ["SCOUT"], ["TRESORIER"], ["SECRETAIRE"]])("refuse %s", (role) => {
    expect(can(user([role]), "pedago.validation.cancel")).toBe(false);
  });

  it("refuse un RG dont le compte n'est pas actif", () => {
    expect(
      can({ role: "RESPONSABLE_GROUPE", roles: ["RESPONSABLE_GROUPE"], status: "SUSPENDED" }, "pedago.validation.cancel"),
    ).toBe(false);
  });
});

// #173 — le RG passe de la lecture seule à l'écriture sur tout le groupe : union
// des droits de CHEF, TRÉSORIER, RESPONSABLE_MATERIEL et SECRÉTAIRE, plus la
// gestion du contenu d'autrui. Seule la zone technique reste à l'ADMIN.
describe("RESPONSABLE_GROUPE — écriture sur tout le groupe (#173)", () => {
  const rg = (extra: string[] = [], unit: string | null = null, status = "ACTIVE") => ({
    id: "rg-1",
    role: "RESPONSABLE_GROUPE",
    roles: ["RESPONSABLE_GROUPE", ...extra],
    unit,
    status,
  });

  it.each(ACTIONS.filter((a) => a !== "admin.access"))("autorise %s", (action) => {
    expect(can(rg(), action)).toBe(true);
  });

  it("refuse admin.access (zone technique, ADMIN seul)", () => {
    expect(can(rg(), "admin.access")).toBe(false);
    expect(can(rg(["CHEF", "TRESORIER", "SECRETAIRE"]), "admin.access")).toBe(false);
  });

  it("n'attribue ni ADMIN ni RESPONSABLE_GROUPE, mais attribue les autres rôles", () => {
    expect(canAssignRole(rg(), "ADMIN")).toBe(false);
    expect(canAssignRole(rg(), "RESPONSABLE_GROUPE")).toBe(false);
    for (const role of ["CHEF", "TRESORIER", "RESPONSABLE_MATERIEL", "SECRETAIRE", "PARENT", "SCOUT"]) {
      expect(canAssignRole(rg(), role)).toBe(true);
    }
  });

  it("un compte RG non ACTIVE n'a aucun droit", () => {
    for (const status of ["PENDING", "SUSPENDED", "REJECTED", "DELETED", undefined]) {
      for (const action of ACTIONS) {
        expect(can({ ...rg(), status }, action)).toBe(false);
      }
    }
  });

  it("n'est borné à aucune branche, même sans unité renseignée", () => {
    expect(canActOnUnit(rg(), "event.manage", "PIONNIERS")).toBe(true);
    expect(canActOnUnit(rg(), "pedago.referential", "SCOUTS")).toBe(true);
    expect(canActOnUnit(rg(), "member.family.manage", "FARFADETS")).toBe(true);
  });

  it("un RG aussi CHEF n'est pas réduit à sa branche (#150)", () => {
    const rgChef = rg(["CHEF"], "SCOUTS");
    expect(canActOnUnit(rgChef, "event.manage", "PIONNIERS")).toBe(true);
    expect(canActOnUnit(rgChef, "pedago.manage", "PIONNIERS")).toBe(true);
    expect(inUnitScope(rgChef, "PIONNIERS")).toBe(true);
  });

  it("un RG aussi TRÉSORIER cumule sans rien perdre", () => {
    const rgTres = rg(["TRESORIER"]);
    for (const action of ["expense.manage", "campaign.manage", "budget.manage", "loan.create"] as const) {
      expect(can(rgTres, action)).toBe(true);
    }
    expect(can(rgTres, "admin.access")).toBe(false);
  });

  it("ouvre la zone /admin (inscriptions, comptes, catégories, dons)", () => {
    expect(canAccessAdminZone(rg())).toBe(true);
  });
});

// #103 (règle du chef) étendue au RG par #173 : qui déclare une note de frais
// ne la valide pas lui-même. Le cas du trésorier seul reste ouvert (#103).
describe("canReviewExpense — pas d'auto-validation d'une note de frais", () => {
  const u = (id: string, roles: string[], status = "ACTIVE") => ({
    id,
    role: roles[0],
    roles,
    status,
  });

  it("le RG valide la note d'un autre", () => {
    expect(canReviewExpense(u("rg-1", ["RESPONSABLE_GROUPE"]), { declarantId: "chef-1" })).toBe(true);
  });

  it("le RG ne valide pas sa propre note", () => {
    expect(canReviewExpense(u("rg-1", ["RESPONSABLE_GROUPE"]), { declarantId: "rg-1" })).toBe(false);
  });

  it("un RG aussi trésorier ne valide pas non plus sa propre note", () => {
    expect(
      canReviewExpense(u("rg-1", ["RESPONSABLE_GROUPE", "TRESORIER"]), { declarantId: "rg-1" }),
    ).toBe(false);
  });

  it("le trésorier seul : comportement inchangé tant que #103 n'est pas tranché", () => {
    expect(canReviewExpense(u("t-1", ["TRESORIER"]), { declarantId: "t-1" })).toBe(true);
    expect(canReviewExpense(u("t-1", ["TRESORIER"]), { declarantId: "x" })).toBe(true);
  });

  it("refuse sans expense.manage, ou hors statut ACTIVE", () => {
    expect(canReviewExpense(u("c-1", ["CHEF"]), { declarantId: "x" })).toBe(false);
    expect(
      canReviewExpense(u("rg-1", ["RESPONSABLE_GROUPE"], "SUSPENDED"), { declarantId: "x" }),
    ).toBe(false);
  });
});

// US-L05 — modifier / archiver un lieu : son créateur, le RG (#173) ou l'ADMIN.
describe("canManagePlace — créateur, RG ou admin", () => {
  const u = (id: string, roles: string[], status = "ACTIVE") => ({
    id,
    role: roles[0],
    roles,
    status,
  });

  it("le chef créateur gère son lieu", () => {
    expect(canManagePlace(u("c-1", ["CHEF"]), { createdById: "c-1" })).toBe(true);
  });

  it("un autre chef ne gère pas le lieu", () => {
    expect(canManagePlace(u("c-2", ["CHEF"]), { createdById: "c-1" })).toBe(false);
  });

  it.each([["RESPONSABLE_GROUPE"], ["ADMIN"]])("%s gère tout lieu, même orphelin", (role) => {
    expect(canManagePlace(u("x", [role]), { createdById: "c-1" })).toBe(true);
    expect(canManagePlace(u("x", [role]), { createdById: null })).toBe(true);
  });

  it("un lieu orphelin (créateur anonymisé) n'est à aucun chef", () => {
    expect(canManagePlace({ role: "CHEF", roles: ["CHEF"], status: "ACTIVE" }, { createdById: null })).toBe(false);
  });

  it("refuse sans place.manage, même au créateur, et hors statut ACTIVE", () => {
    expect(canManagePlace(u("p-1", ["PARENT"]), { createdById: "p-1" })).toBe(false);
    expect(
      canManagePlace(u("rg-1", ["RESPONSABLE_GROUPE"], "SUSPENDED"), { createdById: "c-1" }),
    ).toBe(false);
  });
});

// Épingler un message, clore le sondage d'un autre : chefs, RG (#173), ADMIN.
describe("can — channel.moderate", () => {
  it.each([["CHEF"], ["RESPONSABLE_GROUPE"], ["ADMIN"]])("autorise %s", (role) => {
    expect(can({ role, roles: [role], status: "ACTIVE" }, "channel.moderate")).toBe(true);
  });

  it.each([["PARENT"], ["SCOUT"], ["TRESORIER"], ["SECRETAIRE"], ["RESPONSABLE_MATERIEL"]])(
    "refuse %s",
    (role) => {
      expect(can({ role, roles: [role], status: "ACTIVE" }, "channel.moderate")).toBe(false);
    },
  );
});
