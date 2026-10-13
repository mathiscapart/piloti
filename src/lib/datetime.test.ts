// #115 — src/lib/datetime.ts, base unique du formatage et des calculs de date.
// Deux catégories, et une seule règle : le rendu ne dépend JAMAIS du fuseau
// du serveur.
//  - heure murale (événements, tâches, dates saisies) : formatée en UTC ;
//  - instant réel (createdAt, messages, retours…) : formaté en Europe/Paris.
// On rejoue chaque cas sous plusieurs fuseaux de processus, dont les deux
// changements d'heure de 2026 (29 mars et 25 octobre) pour les instants.

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_TZ = process.env.TZ;
const ZONES = ["UTC", "Europe/Paris", "America/New_York"];

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  vi.resetModules();
});

type DateTimeModule = typeof import("./datetime");

// Change le fuseau du processus PUIS recharge le module (ses formateurs sont
// créés au chargement). Séquentiel : process.env.TZ est global.
async function inEachZone(run: (m: DateTimeModule) => unknown): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const tz of ZONES) {
    process.env.TZ = tz;
    // Node ignore ce changement dans un worker_thread : sans ce contrôle, le
    // test passerait sans avoir changé de fuseau.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
    vi.resetModules();
    results.push(run(await import("./datetime")));
  }
  return results;
}

async function sameInEveryZone(run: (m: DateTimeModule) => unknown): Promise<unknown> {
  const [first, ...rest] = await inEachZone(run);
  for (const r of rest) expect(r).toEqual(first);
  return first;
}

const utc = (iso: string) => new Date(`${iso}Z`);

describe("heure murale — formatée en UTC", () => {
  it("réaffiche exactement l'heure saisie (15:46), quel que soit le fuseau", async () => {
    const d = utc("2026-10-02T15:46:00");
    expect(await sameInEveryZone((m) => m.formatWall(d, "time"))).toBe("15:46");
    expect(await sameInEveryZone((m) => m.formatWall(d, "dateTime"))).toBe(
      "02 oct. 2026, 15:46",
    );
  });

  it("une date seule (minuit UTC) reste le même jour", async () => {
    const d = utc("2026-10-02T00:00:00");
    expect(await sameInEveryZone((m) => m.formatWall(d, "date"))).toBe("02 oct. 2026");
    expect(await sameInEveryZone((m) => m.toDateInput(d))).toBe("2026-10-02");
  });

  it("formatEventRange : un seul jour même à cheval sur minuit local", async () => {
    const r = await sameInEveryZone((m) =>
      m.formatEventRange(utc("2026-10-02T21:00:00"), utc("2026-10-02T22:30:00")),
    );
    expect(r).toBe("ven. 02 oct. · 21:00 – 22:30");
  });

  it("formatEventRange multi-jours, toDatetimeLocal, monthKey et monthLabel", async () => {
    const start = utc("2026-10-02T23:30:00");
    const end = utc("2026-10-04T11:00:00");
    expect(await sameInEveryZone((m) => m.formatEventRange(start, end))).toBe(
      "ven. 02 oct. 23:30 → dim. 04 oct. 11:00",
    );
    expect(await sameInEveryZone((m) => m.toDatetimeLocal(start))).toBe("2026-10-02T23:30");
    expect(await sameInEveryZone((m) => m.monthKey(utc("2026-10-31T23:30:00")))).toBe("2026-9");
    expect(await sameInEveryZone((m) => m.monthLabel(start))).toBe("Octobre 2026");
  });
});

describe("instant réel — formaté en Europe/Paris", () => {
  it("affiche l'heure de Paris, pas celle du serveur", async () => {
    const d = utc("2026-07-14T08:00:00");
    expect(await sameInEveryZone((m) => m.formatInstant(d, "time"))).toBe("10:00");
  });

  it("passage à l'heure d'été (29 mars 2026, 02:00 → 03:00)", async () => {
    expect(
      await sameInEveryZone((m) => m.formatInstant(utc("2026-03-29T00:30:00"), "time")),
    ).toBe("01:30");
    expect(
      await sameInEveryZone((m) => m.formatInstant(utc("2026-03-29T01:30:00"), "time")),
    ).toBe("03:30");
  });

  it("passage à l'heure d'hiver (25 octobre 2026, 03:00 → 02:00)", async () => {
    expect(
      await sameInEveryZone((m) => m.formatInstant(utc("2026-10-25T00:30:00"), "time")),
    ).toBe("02:30");
    expect(
      await sameInEveryZone((m) => m.formatInstant(utc("2026-10-25T01:30:00"), "time")),
    ).toBe("02:30");
  });

  it("le jour affiché est celui de Paris (23:30 UTC = lendemain à Paris)", async () => {
    expect(
      await sameInEveryZone((m) => m.formatInstant(utc("2026-12-31T23:30:00"), "date")),
    ).toBe("01 janv. 2027");
  });
});

describe("wallNow — « maintenant » exprimé en heure murale de Paris", () => {
  it("suit les deux changements d'heure", async () => {
    const cas: [string, string][] = [
      ["2026-03-29T00:30:00", "2026-03-29T01:30:00.000Z"],
      ["2026-03-29T01:30:00", "2026-03-29T03:30:00.000Z"],
      ["2026-10-25T00:30:00", "2026-10-25T02:30:00.000Z"],
      ["2026-10-25T01:30:00", "2026-10-25T02:30:00.000Z"],
    ];
    for (const [now, wall] of cas) {
      expect(await sameInEveryZone((m) => m.wallNow(utc(now)).toISOString())).toBe(wall);
    }
  });

  it("todayInput donne la date du jour à Paris, pas en UTC", async () => {
    // 22:30 UTC le 9 octobre = 00:30 le 10 octobre à Paris.
    expect(await sameInEveryZone((m) => m.todayInput(utc("2026-10-09T22:30:00")))).toBe(
      "2026-10-10",
    );
  });
});

describe("instantToWall / wallToInstant — conversions à l'heure de Paris", () => {
  it("instantToWall : minuit le 1er janvier à Paris tombe dans la nouvelle année", async () => {
    // 23:30 UTC le 31 décembre = 00:30 le 1er janvier à Paris.
    expect(
      await sameInEveryZone((m) => m.instantToWall(utc("2026-12-31T23:30:00")).toISOString()),
    ).toBe("2027-01-01T00:30:00.000Z");
  });

  it("wallToInstant : début de journée à Paris, en hiver et en été", async () => {
    expect(
      await sameInEveryZone((m) => m.wallToInstant(utc("2027-01-01T00:00:00")).toISOString()),
    ).toBe("2026-12-31T23:00:00.000Z");
    expect(
      await sameInEveryZone((m) => m.wallToInstant(utc("2026-07-01T00:00:00")).toISOString()),
    ).toBe("2026-06-30T22:00:00.000Z");
  });

  it("wallToInstant autour des changements d'heure", async () => {
    // 29 mars : 03:30 à Paris = 01:30 UTC ; 25 octobre : 00:00 = 22:00 UTC la veille.
    expect(
      await sameInEveryZone((m) => m.wallToInstant(utc("2026-03-29T03:30:00")).toISOString()),
    ).toBe("2026-03-29T01:30:00.000Z");
    expect(
      await sameInEveryZone((m) => m.wallToInstant(utc("2026-10-25T00:00:00")).toISOString()),
    ).toBe("2026-10-24T22:00:00.000Z");
  });
});

// Les dimanches de changement d'heure : 2026 (29 mars, 25 octobre) et 2027
// (28 mars, 31 octobre), pour ne pas dépendre d'une année.
const BASCULES = [
  { annee: 2026, jour: "2026-03-29", libelle: "dim. 29 mars", mois: "29 mars 2026" },
  { annee: 2026, jour: "2026-10-25", libelle: "dim. 25 oct.", mois: "25 oct. 2026" },
  { annee: 2027, jour: "2027-03-28", libelle: "dim. 28 mars", mois: "28 mars 2027" },
  { annee: 2027, jour: "2027-10-31", libelle: "dim. 31 oct.", mois: "31 oct. 2027" },
];

describe("heure murale — le jour même des changements d'heure", () => {
  for (const b of BASCULES) {
    it(`${b.jour} : 02:30 saisie (heure inexistante ou doublée à Paris) se réaffiche 02:30`, async () => {
      const d = utc(`${b.jour}T02:30:00`);
      expect(await sameInEveryZone((m) => m.formatWall(d, "time"))).toBe("02:30");
      expect(await sameInEveryZone((m) => m.formatWall(d, "dateTime"))).toBe(`${b.mois}, 02:30`);
      expect(await sameInEveryZone((m) => m.toDatetimeLocal(d))).toBe(`${b.jour}T02:30`);
    });

    it(`${b.jour} : 01:00 → 04:00 reste sur un seul jour`, async () => {
      const r = await sameInEveryZone((m) =>
        m.formatEventRange(utc(`${b.jour}T01:00:00`), utc(`${b.jour}T04:00:00`)),
      );
      expect(r).toBe(`${b.libelle} · 01:00 – 04:00`);
    });
  }
});

describe("instant réel — aux bords exacts des changements d'heure", () => {
  const bords: [string, string][] = [
    ["2026-03-29T00:59:59", "29 mars 2026, 01:59"],
    ["2026-03-29T01:00:00", "29 mars 2026, 03:00"],
    ["2026-10-25T00:59:59", "25 oct. 2026, 02:59"],
    ["2026-10-25T01:00:00", "25 oct. 2026, 02:00"],
    ["2027-03-28T00:59:59", "28 mars 2027, 01:59"],
    ["2027-03-28T01:00:00", "28 mars 2027, 03:00"],
    ["2027-10-31T00:59:59", "31 oct. 2027, 02:59"],
    ["2027-10-31T01:00:00", "31 oct. 2027, 02:00"],
  ];
  for (const [iso, attendu] of bords) {
    it(`${iso}Z → ${attendu} (date et heure de Paris)`, async () => {
      expect(await sameInEveryZone((m) => m.formatInstant(utc(iso), "dateTime"))).toBe(attendu);
    });
  }
});

describe("toutes les clés de DateStyle — texte rendu figé", () => {
  // `satisfies` : ajouter un style à DateStyle sans l'ajouter ici casse le typecheck.
  const murale = {
    time: "15:46",
    dayMonth: "02 oct.",
    dayMonthLong: "02 octobre",
    dayMonthNumeric: "02/10",
    date: "02 oct. 2026",
    dateLong: "02 octobre 2026",
    dateNumeric: "02/10/2026",
    dayMonthTime: "02 oct., 15:46",
    dayMonthLongTime: "02 octobre à 15:46",
    dayMonthNumericTime: "02/10 15:46",
    dateTime: "02 oct. 2026, 15:46",
    weekdayDayMonth: "ven. 02 oct.",
    monthYear: "octobre 2026",
  } satisfies Record<import("./datetime").DateStyle, string>;

  // 08:05 UTC en été = 10:05 à Paris.
  const instant = {
    time: "10:05",
    dayMonth: "14 juil.",
    dayMonthLong: "14 juillet",
    dayMonthNumeric: "14/07",
    date: "14 juil. 2026",
    dateLong: "14 juillet 2026",
    dateNumeric: "14/07/2026",
    dayMonthTime: "14 juil., 10:05",
    dayMonthLongTime: "14 juillet à 10:05",
    dayMonthNumericTime: "14/07 10:05",
    dateTime: "14 juil. 2026, 10:05",
    weekdayDayMonth: "mar. 14 juil.",
    monthYear: "juillet 2026",
  } satisfies Record<import("./datetime").DateStyle, string>;

  it("heure murale (formatWall), sous UTC, Paris et New York", async () => {
    const d = utc("2026-10-02T15:46:00");
    const rendu = await sameInEveryZone((m) =>
      Object.fromEntries(Object.keys(murale).map((s) => [s, m.formatWall(d, s as never)])),
    );
    expect(rendu).toEqual(murale);
  });

  it("instant réel (formatInstant), sous UTC, Paris et New York", async () => {
    const d = utc("2026-07-14T08:05:00");
    const rendu = await sameInEveryZone((m) =>
      Object.fromEntries(Object.keys(instant).map((s) => [s, m.formatInstant(d, s as never)])),
    );
    expect(rendu).toEqual(instant);
  });
});

describe("wallToInstant(instantToWall(x)) = x", () => {
  // Hors heure inexistante (jamais produite par instantToWall) et hors première
  // occurrence de l'heure doublée (00:00–00:59:59 UTC le jour du passage à
  // l'heure d'hiver, voir le test suivant).
  const echantillon = [
    "2026-01-15T08:05:00.123",
    "2026-07-14T08:05:00",
    "2026-03-28T23:59:59", // veille de bascule
    "2026-03-29T00:30:00", // 01:30 à Paris, juste avant le saut
    "2026-03-29T00:59:59", // 01:59:59, dernière seconde avant le saut
    "2026-03-29T01:00:00", // 03:00, première seconde après le saut
    "2026-03-29T01:30:00",
    "2026-10-24T23:59:59", // 01:59:59 à Paris, avant le doublon
    "2026-10-25T01:00:00", // 02:00 (heure d'hiver), début de la 2e occurrence
    "2026-10-25T01:30:00", // 02:30, 2e occurrence
    "2026-10-25T02:00:00",
    "2027-03-28T00:30:00",
    "2027-03-28T01:00:00",
    "2027-03-28T01:30:00",
    "2027-10-30T23:59:59",
    "2027-10-31T01:30:00",
    "2027-10-31T02:00:00",
  ];
  it("aller-retour exact sur l'échantillon, dont les deux nuits de bascule", async () => {
    for (const iso of echantillon) {
      const x = new Date(`${iso}${iso.includes(".") ? "" : ".000"}Z`);
      const retour = await sameInEveryZone((m) => m.wallToInstant(m.instantToWall(x)).toISOString());
      expect(retour, iso).toBe(x.toISOString());
    }
  });

  it("heure doublée du 25 octobre : 02:30 murale = la 2e occurrence (01:30Z, heure d'hiver)", async () => {
    // 02:30 existe deux fois à Paris (00:30Z en CEST, 01:30Z en CET) : wallToInstant
    // retient la seconde. Conséquence documentée : la première occurrence ne
    // fait pas l'aller-retour (00:30Z -> 02:30 -> 01:30Z).
    expect(
      await sameInEveryZone((m) => m.wallToInstant(utc("2026-10-25T02:30:00")).toISOString()),
    ).toBe("2026-10-25T01:30:00.000Z");
    expect(
      await sameInEveryZone((m) =>
        m.wallToInstant(m.instantToWall(utc("2026-10-25T00:30:00"))).toISOString(),
      ),
    ).toBe("2026-10-25T01:30:00.000Z");
  });

  it("heure inexistante du 29 mars : 02:30 murale est décalée à 03:30 de Paris (01:30Z)", async () => {
    expect(
      await sameInEveryZone((m) => m.wallToInstant(utc("2026-03-29T02:30:00")).toISOString()),
    ).toBe("2026-03-29T01:30:00.000Z");
  });
});
