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

  it("plafonne au dernier jour du mois cible en mensuel (fin de mois)", () => {
    expect(advanceDate(utc(2026, 0, 31), "MONTHLY", 1)).toEqual(utc(2026, 1, 28));
    expect(advanceDate(utc(2028, 0, 31), "MONTHLY", 1)).toEqual(utc(2028, 1, 29));
    expect(advanceDate(utc(2026, 2, 31), "MONTHLY", 1)).toEqual(utc(2026, 3, 30));
  });

  it("plafonne le 29 février au 28 en annuel vers une année non bissextile", () => {
    expect(advanceDate(utc(2028, 1, 29), "YEARLY", 1)).toEqual(utc(2029, 1, 28));
    expect(advanceDate(utc(2028, 1, 29), "YEARLY", 4)).toEqual(utc(2032, 1, 29));
  });

  it("plafonne correctement quand le mensuel franchit une année", () => {
    expect(advanceDate(utc(2026, 11, 31), "MONTHLY", 2)).toEqual(utc(2027, 1, 28));
    expect(advanceDate(utc(2026, 10, 30), "MONTHLY", 3)).toEqual(utc(2027, 1, 28));
  });

  it("plafonne avec un intervalle supérieur à 1", () => {
    expect(advanceDate(utc(2026, 0, 31), "MONTHLY", 3)).toEqual(utc(2026, 3, 30));
    expect(advanceDate(utc(2026, 4, 31), "MONTHLY", 13)).toEqual(utc(2027, 5, 30));
  });

  it("reste au jour plafonné pour la suite de la série (31/01 → 28/02 → 28/03)", () => {
    const fev = advanceDate(utc(2026, 0, 31), "MONTHLY", 1);
    expect(fev).toEqual(utc(2026, 1, 28));
    expect(advanceDate(fev, "MONTHLY", 1)).toEqual(utc(2026, 2, 28));
  });

  it("ne modifie pas un jour qui existe dans le mois cible", () => {
    expect(advanceDate(utc(2026, 0, 15), "MONTHLY", 1)).toEqual(utc(2026, 1, 15));
    expect(advanceDate(utc(2026, 0, 28), "MONTHLY", 1)).toEqual(utc(2026, 1, 28));
    expect(advanceDate(utc(2026, 1, 28), "YEARLY", 1)).toEqual(utc(2027, 1, 28));
  });

  it("renvoie la date inchangée pour une fréquence inconnue", () => {
    const d = utc(2026, 8, 20);
    expect(advanceDate(d, "NONE" as never, 1)).toBe(d);
  });
});
