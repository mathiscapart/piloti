import { describe, expect, it } from "vitest";

import { checkEventDates, checkTaskDueDate } from "./date-rules";
import { dueLabel } from "./task-vm";

// #75 — bornes des dates du planning. « Maintenant » en heure murale : 11/09/2026 10:00.
const NOW = new Date(Date.UTC(2026, 8, 11, 10, 0));
const at = (y: number, mo: number, d: number, h = 10) => new Date(Date.UTC(y, mo - 1, d, h));

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
