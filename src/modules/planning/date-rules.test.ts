import { describe, expect, it } from "vitest";

import { checkEventDates, checkTaskDueDate } from "./date-rules";
import { dueLabel } from "./task-vm";

// #75 — bornes des dates du planning. « Maintenant » en heure murale : 11/09/2026 10:00.
const NOW = new Date(Date.UTC(2026, 8, 11, 10, 0));
const at = (y: number, mo: number, d: number, h = 10, mi = 0) =>
  new Date(Date.UTC(y, mo - 1, d, h, mi));

describe("checkEventDates", () => {
  const start = at(2026, 10, 10);
  const end = at(2026, 10, 10, 12);

  it("accepte un événement à venir sans date limite", () => {
    expect(checkEventDates({ start, end, deadline: null }, { now: NOW, creating: true })).toBeNull();
  });

  it("refuse une fin avant le début", () => {
    expect(
      checkEventDates({ start: end, end: start, deadline: null }, { now: NOW, creating: true }),
    ).toBe("La date de fin doit être postérieure au début.");
  });

  it("accepte une date limite égale au début", () => {
    expect(checkEventDates({ start, end, deadline: start }, { now: NOW, creating: true })).toBeNull();
  });

  it("refuse une date limite après le début, en création comme en modification", () => {
    const deadline = at(2026, 10, 20);
    const msg = "La date limite d'inscription doit précéder le début de l'événement.";
    expect(checkEventDates({ start, end, deadline }, { now: NOW, creating: true })).toBe(msg);
    expect(checkEventDates({ start, end, deadline }, { now: NOW, creating: false })).toBe(msg);
  });

  it("refuse un début passé à la création, l'accepte en modification", () => {
    const past = { start: at(2026, 9, 1), end: at(2026, 9, 1, 12), deadline: null };
    expect(checkEventDates(past, { now: NOW, creating: true })).toBe(
      "Le début de l'événement est déjà passé.",
    );
    expect(checkEventDates(past, { now: NOW, creating: false })).toBeNull();
  });

  it("refuse une année hors de la plage année courante − 1 à + 5", () => {
    const msg = "Les dates doivent être comprises entre 2025 et 2031.";
    const old = { start: at(1990, 1, 1), end: at(1990, 1, 1, 12), deadline: null };
    expect(checkEventDates(old, { now: NOW, creating: false })).toBe(msg);
    const far = { start: at(2032, 1, 1), end: at(2032, 1, 1, 12), deadline: null };
    expect(checkEventDates(far, { now: NOW, creating: true })).toBe(msg);
    const farEnd = { start, end: at(2032, 1, 1), deadline: null };
    expect(checkEventDates(farEnd, { now: NOW, creating: true })).toBe(msg);
    const oldDeadline = { start, end, deadline: at(1990, 1, 1) };
    expect(checkEventDates(oldDeadline, { now: NOW, creating: true })).toBe(msg);
  });
});

describe("checkTaskDueDate", () => {
  it("accepte une échéance vide", () => {
    expect(checkTaskDueDate(null, NOW)).toBeNull();
  });

  it("accepte une échéance dans la plage, même passée", () => {
    expect(checkTaskDueDate(at(2025, 1, 1, 0), NOW)).toBeNull();
    expect(checkTaskDueDate(at(2031, 12, 31, 0), NOW)).toBeNull();
  });

  it("refuse une échéance hors plage", () => {
    const msg = "L'échéance doit être comprise entre 2025 et 2031.";
    expect(checkTaskDueDate(at(1900, 1, 1, 0), NOW)).toBe(msg);
    expect(checkTaskDueDate(at(2032, 1, 1, 0), NOW)).toBe(msg);
  });
});

describe("dueLabel", () => {
  it("omet l'année courante, affiche les autres", () => {
    expect(dueLabel(at(2026, 1, 1, 0), NOW)).toBe("01 janv.");
    expect(dueLabel(at(2025, 1, 1, 0), NOW)).toBe("01 janv. 2025");
  });
});

// Bornes de la plage pour NOW (2026) : 2025 (min) à 2031 (max).
const RANGE_MSG = "Les dates doivent être comprises entre 2025 et 2031.";
const MIN_OK = at(2025, 1, 1, 0, 0);
const MAX_OK = at(2031, 12, 31, 23, 59);
const BELOW_MIN = at(2024, 12, 31, 23, 59);
const ABOVE_MAX = at(2032, 1, 1, 0, 0);
const edit = { now: NOW, creating: false };

describe("checkEventDates — bornes d'année", () => {
  it("accepte le 1er janvier 00:00 de l'année min et le 31/12 23:59 de l'année max", () => {
    expect(checkEventDates({ start: MIN_OK, end: MIN_OK, deadline: null }, edit)).toBeNull();
    expect(checkEventDates({ start: MAX_OK, end: MAX_OK, deadline: null }, edit)).toBeNull();
    expect(checkEventDates({ start: MIN_OK, end: MAX_OK, deadline: MIN_OK }, edit)).toBeNull();
  });

  it("refuse le 31/12 23:59 de min − 1, pour début, fin et date limite", () => {
    const ok = at(2026, 10, 10);
    expect(checkEventDates({ start: BELOW_MIN, end: ok, deadline: null }, edit)).toBe(RANGE_MSG);
    expect(checkEventDates({ start: ok, end: ok, deadline: BELOW_MIN }, edit)).toBe(RANGE_MSG);
    expect(checkEventDates({ start: BELOW_MIN, end: BELOW_MIN, deadline: null }, edit)).toBe(
      RANGE_MSG,
    );
  });

  it("refuse le 1er janvier 00:00 de max + 1, pour début, fin et date limite", () => {
    const ok = at(2026, 10, 10);
    expect(checkEventDates({ start: ok, end: ABOVE_MAX, deadline: null }, edit)).toBe(RANGE_MSG);
    expect(checkEventDates({ start: ABOVE_MAX, end: ABOVE_MAX, deadline: null }, edit)).toBe(
      RANGE_MSG,
    );
    expect(checkEventDates({ start: ABOVE_MAX, end: ABOVE_MAX, deadline: ok }, edit)).toBe(
      RANGE_MSG,
    );
  });

  it("annonce la plage avant les autres erreurs (fin < début hors plage)", () => {
    expect(checkEventDates({ start: ABOVE_MAX, end: at(2026, 1, 1), deadline: null }, edit)).toBe(
      RANGE_MSG,
    );
  });

  it("accepte le 29 février d'une année bissextile dans la plage (2028)", () => {
    const d = at(2028, 2, 29);
    expect(checkEventDates({ start: d, end: d, deadline: null }, { now: NOW, creating: true })).toBeNull();
    expect(checkTaskDueDate(d, NOW)).toBeNull();
  });

  it("la plage suit l'année de now (now en 2028 : 2027 à 2033)", () => {
    const now = at(2028, 6, 1);
    const msg = "Les dates doivent être comprises entre 2027 et 2033.";
    const d = (y: number) => ({ start: at(y, 12, 1), end: at(y, 12, 1), deadline: null });
    expect(checkEventDates(d(2027), { now, creating: false })).toBeNull();
    expect(checkEventDates(d(2033), { now, creating: false })).toBeNull();
    expect(checkEventDates(d(2026), { now, creating: false })).toBe(msg);
    expect(checkEventDates(d(2034), { now, creating: false })).toBe(msg);
  });
});

describe("checkEventDates — ordre des dates", () => {
  const start = at(2026, 10, 10, 10, 0);
  const end = at(2026, 10, 10, 12);
  const DEADLINE_MSG = "La date limite d'inscription doit précéder le début de l'événement.";

  it("accepte une fin égale au début", () => {
    expect(checkEventDates({ start, end: start, deadline: null }, edit)).toBeNull();
  });

  it("refuse une fin 1 minute avant le début", () => {
    expect(
      checkEventDates({ start, end: at(2026, 10, 10, 9, 59), deadline: null }, edit),
    ).toBe("La date de fin doit être postérieure au début.");
  });

  it("refuse une date limite 1 minute après le début, accepte 1 minute avant", () => {
    expect(
      checkEventDates({ start, end, deadline: at(2026, 10, 10, 10, 1) }, edit),
    ).toBe(DEADLINE_MSG);
    expect(
      checkEventDates({ start, end, deadline: at(2026, 10, 10, 9, 59) }, edit),
    ).toBeNull();
  });

  it("une date limite nulle n'est pas contrôlée", () => {
    expect(checkEventDates({ start, end, deadline: null }, { now: NOW, creating: true })).toBeNull();
  });

  it("accepte en création un début égal à now, refuse now − 1 minute", () => {
    const creating = { now: NOW, creating: true };
    expect(checkEventDates({ start: NOW, end: NOW, deadline: null }, creating)).toBeNull();
    const before = at(2026, 9, 11, 9, 59);
    expect(checkEventDates({ start: before, end: NOW, deadline: null }, creating)).toBe(
      "Le début de l'événement est déjà passé.",
    );
    expect(checkEventDates({ start: before, end: NOW, deadline: null }, edit)).toBeNull();
  });

  it("accepte en modification un début passé avec une date limite valide", () => {
    const s = at(2026, 9, 1);
    expect(checkEventDates({ start: s, end: s, deadline: at(2026, 8, 20) }, edit)).toBeNull();
  });
});

describe("checkTaskDueDate — bornes", () => {
  const msg = "L'échéance doit être comprise entre 2025 et 2031.";

  it("accepte les bornes exactes", () => {
    expect(checkTaskDueDate(MIN_OK, NOW)).toBeNull();
    expect(checkTaskDueDate(MAX_OK, NOW)).toBeNull();
  });

  it("refuse min − 1 (31/12 23:59) et max + 1 (01/01 00:00)", () => {
    expect(checkTaskDueDate(BELOW_MIN, NOW)).toBe(msg);
    expect(checkTaskDueDate(ABOVE_MAX, NOW)).toBe(msg);
  });

  it("accepte le 29 février 2028 et une échéance passée dans la plage", () => {
    expect(checkTaskDueDate(at(2028, 2, 29, 0), NOW)).toBeNull();
    expect(checkTaskDueDate(at(2026, 1, 1, 0), NOW)).toBeNull();
  });
});

describe("dueLabel — année", () => {
  it("omet l'année pour le 31/12 de l'année courante", () => {
    expect(dueLabel(at(2026, 12, 31, 23, 59), NOW)).toBe("31 déc.");
  });

  it("affiche l'année au passage d'année (now 31/12, échéance 01/01 suivant)", () => {
    const now = at(2026, 12, 31, 23, 59);
    expect(dueLabel(at(2027, 1, 1, 0, 0), now)).toBe("01 janv. 2027");
    expect(dueLabel(at(2026, 12, 31, 0, 0), now)).toBe("31 déc.");
  });

  it("affiche l'année pour l'année suivante et les années passées", () => {
    expect(dueLabel(at(2027, 6, 15), NOW)).toContain("2027");
    expect(dueLabel(at(2025, 12, 31, 23, 59), NOW)).toContain("2025");
    expect(dueLabel(at(2027, 6, 15), NOW)).not.toBe(dueLabel(at(2026, 6, 15), NOW));
    expect(dueLabel(at(2026, 6, 15), NOW)).not.toContain("2026");
  });
});
