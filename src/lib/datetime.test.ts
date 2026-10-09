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
