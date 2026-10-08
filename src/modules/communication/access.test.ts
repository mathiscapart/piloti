// Tests de src/modules/communication/access.ts — accès aux salons (US-C09) et
// unités encadrées (#128) : un chef voit aussi les salons des unités qu'il
// encadre, et n'est exclu d'un salon que si TOUTES ses unités (appartenance +
// encadrées) sont exclues. Une régression ici ouvre un salon d'unité à qui
// n'en fait pas partie, ou le ferme à son chef.

import { describe, expect, it } from "vitest";

import { canAccessChannel, canWriteChannel } from "./access";

function user(roles: string[], unit: string | null, ledUnits?: string[]) {
  return { role: roles[0], roles, unit, ledUnits, status: "ACTIVE" };
}

function channel(
  accessUnits: string[] = [],
  excludeUnits: string[] = [],
  accessRoles: string[] = [],
  archived = false,
) {
  return {
    accessRoles: JSON.stringify(accessRoles),
    accessUnits: JSON.stringify(accessUnits),
    excludeUnits: JSON.stringify(excludeUnits),
    archived,
  };
}

// Seed : Lucas, compagnon CHEF qui encadre les Louveteaux ; Robin, compagnon.
const lucas = user(["CHEF"], "COMPAGNONS", ["LOUVETEAUX"]);
const robin = user(["SCOUT"], "COMPAGNONS");

describe("canAccessChannel — unités encadrées (#128)", () => {
  it("un chef voit le salon d'une unité qu'il encadre, un simple membre non", () => {
    const louveteaux = channel(["LOUVETEAUX"]);
    expect(canAccessChannel(lucas, louveteaux)).toBe(true);
    expect(canAccessChannel(robin, louveteaux)).toBe(false);
  });

  it("un chef garde le salon de son unité d'appartenance", () => {
    expect(canAccessChannel(lucas, channel(["COMPAGNONS"]))).toBe(true);
  });

  it("n'ouvre pas le salon d'une unité ni encadrée ni d'appartenance", () => {
    expect(canAccessChannel(lucas, channel(["SCOUTS"]))).toBe(false);
  });

  it("une unité encadrée sans rôle Chef n'ouvre rien", () => {
    const pasChef = user(["SECRETAIRE"], "ADULTES", ["LOUVETEAUX"]);
    expect(canAccessChannel(pasChef, channel(["LOUVETEAUX"]))).toBe(false);
  });

  it("CHEF sans unité encadrée : seulement son unité d'appartenance", () => {
    const chef = user(["CHEF"], "COMPAGNONS", []);
    expect(canAccessChannel(chef, channel(["LOUVETEAUX"]))).toBe(false);
    expect(canAccessChannel(chef, channel(["COMPAGNONS"]))).toBe(true);
    const sansListe = user(["CHEF"], "COMPAGNONS");
    expect(canAccessChannel(sansListe, channel(["LOUVETEAUX"]))).toBe(false);
  });

  it("compte non actif : refusé malgré ses unités encadrées", () => {
    const suspendu = { ...lucas, status: "SUSPENDED" };
    expect(canAccessChannel(suspendu, channel(["LOUVETEAUX"]))).toBe(false);
  });
});

describe("canAccessChannel — exclusion (excludeUnits) et unités encadrées (#128)", () => {
  it("exclu seulement si toutes ses unités sont exclues", () => {
    // Salon ouvert sauf aux Compagnons : Lucas y entre par les Louveteaux.
    expect(canAccessChannel(lucas, channel([], ["COMPAGNONS"]))).toBe(true);
    expect(canAccessChannel(robin, channel([], ["COMPAGNONS"]))).toBe(false);
    // Les deux exclues : Lucas aussi.
    expect(canAccessChannel(lucas, channel([], ["COMPAGNONS", "LOUVETEAUX"]))).toBe(
      false,
    );
    // Seule l'unité encadrée exclue : il garde son appartenance.
    expect(canAccessChannel(lucas, channel([], ["LOUVETEAUX"]))).toBe(true);
  });

  it("l'exclusion ne contourne pas les conditions d'accès", () => {
    // Salon des Scouts, Compagnons exclus : Lucas n'est ni scout ni chef scout.
    expect(canAccessChannel(lucas, channel(["SCOUTS"], ["COMPAGNONS"]))).toBe(false);
    // Salon des Louveteaux, Compagnons exclus : il y entre comme chef.
    expect(canAccessChannel(lucas, channel(["LOUVETEAUX"], ["COMPAGNONS"]))).toBe(
      true,
    );
  });

  it("une unité encadrée sans rôle Chef ne sauve pas de l'exclusion", () => {
    const pasChef = user(["SCOUT"], "COMPAGNONS", ["LOUVETEAUX"]);
    expect(canAccessChannel(pasChef, channel([], ["COMPAGNONS"]))).toBe(false);
  });

  it("sans aucune unité : jamais exclu, comme avant", () => {
    const parent = user(["PARENT"], null);
    expect(canAccessChannel(parent, channel([], ["COMPAGNONS"]))).toBe(true);
  });

  it("l'ADMIN passe toujours, même avec toutes ses unités exclues", () => {
    const admin = user(["ADMIN", "CHEF"], "COMPAGNONS", ["LOUVETEAUX"]);
    expect(canAccessChannel(admin, channel([], ["COMPAGNONS", "LOUVETEAUX"]))).toBe(
      true,
    );
  });
});

describe("canAccessChannel — un chef actuel garde exactement ses accès (#128)", () => {
  // La migration donne à chaque chef `UnitLead` = son unité. Sur toutes les
  // combinaisons de salon, ses accès sont ceux d'avant #128, où seule `unit`
  // comptait — c'est-à-dire ceux du même compte sans unité encadrée.
  const UNITS = ["LOUVETEAUX", "PIONNIERS", "COMPAGNONS"];
  const unitSets = [[], ["PIONNIERS"], ["LOUVETEAUX"], ["PIONNIERS", "COMPAGNONS"]];
  const roleSets = [[], ["CHEF"], ["PARENT"]];
  const channels = unitSets.flatMap((access) =>
    unitSets.flatMap((exclude) =>
      roleSets.flatMap((roles) => [
        channel(access, exclude, roles),
        channel(access, exclude, roles, true),
      ]),
    ),
  );

  it.each(UNITS)("chef repris des %s : mêmes accès qu'avant", (unit) => {
    const repris = user(["CHEF"], unit, [unit]);
    const avant = user(["CHEF"], unit);
    for (const c of channels) {
      expect(canAccessChannel(repris, c)).toBe(canAccessChannel(avant, c));
      expect(canWriteChannel(repris, c)).toBe(canWriteChannel(avant, c));
    }
  });

  it("chef repris des Pionniers : valeurs attendues explicites", () => {
    const chef = user(["CHEF"], "PIONNIERS", ["PIONNIERS"]);
    expect(canAccessChannel(chef, channel(["PIONNIERS"]))).toBe(true);
    expect(canAccessChannel(chef, channel(["LOUVETEAUX"]))).toBe(false);
    expect(canAccessChannel(chef, channel([], ["PIONNIERS"]))).toBe(false);
    expect(canAccessChannel(chef, channel(["LOUVETEAUX"], [], ["CHEF"]))).toBe(true);
  });
});

describe("canWriteChannel — unités encadrées (#128)", () => {
  it("écrit dans le salon d'une unité encadrée, sauf s'il est archivé", () => {
    expect(canWriteChannel(lucas, channel(["LOUVETEAUX"]))).toBe(true);
    expect(canWriteChannel(lucas, channel(["LOUVETEAUX"], [], [], true))).toBe(false);
    expect(canWriteChannel(robin, channel(["LOUVETEAUX"]))).toBe(false);
  });
});
