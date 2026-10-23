import { describe, expect, it } from "vitest";
import { advanceDate, nextOccurrenceData } from "./recurrence";

// #113 — l'occurrence suivante d'une tâche récurrente garde son responsable.
const baseTask = {
  title: "[PLA] Tâche récurrente",
  recurrence: "WEEKLY",
  recurrenceEvery: 1,
  groupTask: false,
  minRequired: 0,
  createdById: "creator",
  assigneeId: "u1",
  assignee: { status: "ACTIVE" },
  dueDate: new Date(Date.UTC(2026, 8, 20)),
};

describe("nextOccurrenceData", () => {
  it("reporte un responsable actif et avance l'échéance d'une semaine", () => {
    const next = nextOccurrenceData(baseTask);
    expect(next.assigneeId).toBe("u1");
    expect(next.dueDate).toEqual(new Date(Date.UTC(2026, 8, 27)));
  });

  it("garde une tâche sans responsable sans responsable", () => {
    expect(
      nextOccurrenceData({ ...baseTask, assigneeId: null, assignee: null }).assigneeId,
    ).toBeNull();
  });

  // Décision de Mathis sur la PR #191 : un responsable qui n'est plus actif
  // n'est pas reconduit, l'occurrence suivante repart sans responsable.
  it("ne reporte pas un responsable suspendu", () => {
    const next = nextOccurrenceData({ ...baseTask, assignee: { status: "SUSPENDED" } });
    expect(next.assigneeId).toBeNull();
    expect(next.dueDate).toEqual(new Date(Date.UTC(2026, 8, 27)));
  });

  it("ne reporte pas un responsable anonymisé (compte supprimé)", () => {
    const next = nextOccurrenceData({ ...baseTask, assignee: { status: "DELETED" } });
    expect(next.assigneeId).toBeNull();
    expect(next.dueDate).toEqual(new Date(Date.UTC(2026, 8, 27)));
  });

  it("ne reporte qu'un responsable ACTIVE (liste blanche, pas liste noire)", () => {
    expect(
      nextOccurrenceData({ ...baseTask, assignee: { status: "PENDING" } }).assigneeId,
    ).toBeNull();
  });

  it("garde une échéance absente à null (le responsable est quand même reporté)", () => {
    const next = nextOccurrenceData({ ...baseTask, dueDate: null });
    expect(next.dueDate).toBeNull();
    expect(next.assigneeId).toBe("u1");
  });

  it("reporte les réglages de la tâche de groupe, pas les inscriptions ni le statut", () => {
    const next = nextOccurrenceData({ ...baseTask, groupTask: true, minRequired: 3 });
    expect(next).toEqual({
      title: "[PLA] Tâche récurrente",
      recurrence: "WEEKLY",
      recurrenceEvery: 1,
      groupTask: true,
      minRequired: 3,
      createdById: "creator",
      assigneeId: "u1",
      dueDate: new Date(Date.UTC(2026, 8, 27)),
    });
  });
});

describe("advanceDate", () => {
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

  it("applique l'intervalle à chaque fréquence", () => {
    expect(advanceDate(utc(2026, 8, 20), "DAILY", 3)).toEqual(utc(2026, 8, 23));
    expect(advanceDate(utc(2026, 8, 20), "WEEKLY", 2)).toEqual(utc(2026, 8, 34));
    expect(advanceDate(utc(2026, 8, 20), "MONTHLY", 2)).toEqual(utc(2026, 10, 20));
    expect(advanceDate(utc(2026, 8, 20), "YEARLY", 2)).toEqual(utc(2028, 8, 20));
  });

  it("traite un intervalle < 1 comme 1", () => {
    expect(advanceDate(utc(2026, 8, 20), "DAILY", 0)).toEqual(utc(2026, 8, 21));
  });

  it("franchit les fins de mois et d'année", () => {
    expect(advanceDate(utc(2026, 11, 31), "DAILY", 1)).toEqual(utc(2027, 0, 1));
    expect(advanceDate(utc(2026, 11, 15), "MONTHLY", 1)).toEqual(utc(2027, 0, 15));
  });

  it("renvoie la date inchangée pour une fréquence inconnue", () => {
    const d = utc(2026, 8, 20);
    expect(advanceDate(d, "NONE" as never, 1)).toBe(d);
  });
});
