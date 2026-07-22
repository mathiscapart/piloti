// Tests de src/lib/permissions.ts — source unique de la matrice de rôles.
// Toute régression ici est un problème de contrôle d'accès, pas un simple bug
// d'affichage : on verrouille en priorité le superutilisateur ADMIN, le refus
// systématique hors statut ACTIVE, le parsing de `roles` (JSON stocké en base,
// potentiellement vide ou malformé) et le garde-fou anti-élévation de
// `canAssignRole`.

import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canAccessAdminZone,
  canAssignRole,
  effectiveRoles,
  hasRole,
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
