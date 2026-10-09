import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NextEvent } from "@/modules/dashboard/queries";

// #115 — Les heures d'événement sont stockées en « heure murale » UTC
// (cf. planning/format.ts) : la carte « Prochain rendez-vous » doit afficher
// la même heure que /planning, quel que soit le fuseau du serveur.

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  // process.env convertit en chaîne : restaurer `undefined` écrirait "undefined".
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  vi.resetModules();
});

// Les formateurs (planning/format.ts) sont créés au chargement du module : on
// fixe le fuseau AVANT d'importer, et on recharge les modules à chaque rendu.
async function renderIn(tz: string, event: NextEvent): Promise<string> {
  process.env.TZ = tz;
  // Node ignore ce changement dans un worker_thread (pool « threads ») : sans
  // ce contrôle, le test passerait sans avoir changé de fuseau.
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
  vi.resetModules();
  const { NextEventCard } = await import("./NextEventCard");
  return renderToStaticMarkup(createElement(NextEventCard, { event }));
}

function eventAt(start: string, end: string): NextEvent {
  return {
    id: "evt",
    name: "Service pionniers",
    startDate: new Date(start),
    endDate: new Date(end),
    location: null,
    unit: null,
    registrationOpen: false,
    registeredCount: 0,
    myResponse: null,
  };
}

const ZONES = ["UTC", "Europe/Paris", "America/New_York"];

describe("NextEventCard — indépendance au fuseau du serveur", () => {
  it("affiche l'heure murale saisie (15:46), comme le planning", async () => {
    const event = eventAt("2026-10-02T15:46:00Z", "2026-10-02T18:00:00Z");
    const { formatEventRange } = await import("@/modules/planning/format");
    const planning = formatEventRange(event.startDate, event.endDate);

    for (const tz of ZONES) {
      const html = await renderIn(tz, event);
      expect(html, tz).toContain("15:46");
      expect(html, tz).toContain(planning);
    }
  });

  it("garde un événement du même jour sur un seul jour, même à cheval sur minuit local", async () => {
    // 21:00 → 22:30 en heure murale : à Paris, la fin tomberait le lendemain.
    const event = eventAt("2026-10-02T21:00:00Z", "2026-10-02T22:30:00Z");
    for (const tz of ZONES) {
      const html = await renderIn(tz, event);
      expect(html, tz).toContain("21:00");
      expect(html, tz).not.toContain("→");
    }
  });

  it("rend exactement le même texte dans tous les fuseaux", async () => {
    const event = eventAt("2026-10-02T23:30:00Z", "2026-10-04T11:00:00Z");
    // Séquentiel : renderIn modifie process.env.TZ, global au processus.
    const rendus: string[] = [];
    for (const tz of ZONES) rendus.push(await renderIn(tz, event));
    for (const html of rendus) expect(html).toBe(rendus[0]);
  });

  it("affiche l'heure murale en heure d'hiver comme en heure d'été", async () => {
    // Décalage de Paris différent (+1 / +2) : l'heure affichée ne doit pas bouger.
    for (const [debut, heure] of [
      ["2026-01-15T09:15:00Z", "09:15"],
      ["2026-07-15T09:15:00Z", "09:15"],
    ] as const) {
      const event = eventAt(debut, debut.replace("09:15", "11:00"));
      for (const tz of ZONES) {
        expect(await renderIn(tz, event), `${tz} ${debut}`).toContain(heure);
      }
    }
  });
});

// Garde-fou statique : dans les fichiers corrigés, aucune date n'est formatée
// dans le fuseau implicite du serveur.
const FICHIERS = [
  "./NextEventCard.tsx",
  "../../modules/planning/format.ts",
];

describe("Formatage des dates d'événement — timeZone explicite", () => {
  for (const relatif of FICHIERS) {
    const source = readFileSync(fileURLToPath(new URL(relatif, import.meta.url)), "utf8");

    it(`${relatif} : chaque Intl.DateTimeFormat précise un timeZone`, () => {
      const appels = source.split("new Intl.DateTimeFormat(").slice(1);
      for (const appel of appels) {
        const options = appel.slice(0, appel.indexOf(")"));
        expect(options).toContain("timeZone");
      }
    });

    it(`${relatif} : aucune méthode de Date dépendante du fuseau local`, () => {
      expect(source).not.toMatch(
        /\.(toLocaleString|toLocaleDateString|toLocaleTimeString|toDateString|toTimeString|getFullYear|getMonth|getDate|getDay|getHours|getMinutes)\(/,
      );
    });
  }
});
