// Tests de src/modules/inventory/loan-overdue.ts — règle unique du retard de
// prêt (issue #189, D-047). Une divergence ici fait se contredire le badge, les
// compteurs, l'alerte et le calcul de disponibilité.

import { describe, expect, it } from "vitest";
import { daysLate, isLoanLate, isPastDue, lateLoanWhere } from "./loan-overdue";

// Heures murales : composantes UTC = heure à Paris.
const at = (iso: string) => new Date(`${iso}Z`);
const DUE = at("2026-10-26T00:00:00.000"); // retour prévu le 26/10 (date saisie)

describe("isPastDue — en retard dès l'instant de retour prévu", () => {
  it("retour prévu hier → en retard", () => {
    expect(isPastDue(at("2026-10-25T00:00:00.000"), at("2026-10-26T10:00:00.000"))).toBe(true);
  });

  it("frontière : pile à l'instant prévu → pas encore en retard", () => {
    expect(isPastDue(DUE, at("2026-10-26T00:00:00.000"))).toBe(false);
  });

  it("retour prévu aujourd'hui (date saisie = 00:00), juste après minuit → en retard", () => {
    expect(isPastDue(DUE, at("2026-10-26T00:00:00.001"))).toBe(true);
    expect(isPastDue(DUE, at("2026-10-26T00:00:01.000"))).toBe(true);
  });

  it("retour prévu aujourd'hui, avant minuit → en retard", () => {
    expect(isPastDue(DUE, at("2026-10-26T23:59:59.999"))).toBe(true);
  });

  it("veille au soir, juste avant 00:00 → pas en retard", () => {
    expect(isPastDue(DUE, at("2026-10-25T23:59:59.999"))).toBe(false);
  });

  it("retour prévu demain → pas en retard", () => {
    expect(isPastDue(at("2026-10-27T00:00:00.000"), at("2026-10-26T23:59:59.999"))).toBe(false);
  });

  it("une heure dans la date prévue est respectée (seed : 26/10 15:00)", () => {
    const due = at("2026-10-26T15:00:00.000");
    expect(isPastDue(due, at("2026-10-26T14:59:59.999"))).toBe(false);
    expect(isPastDue(due, at("2026-10-26T15:00:00.001"))).toBe(true);
  });
});

describe("isLoanLate — statut + date", () => {
  const now = at("2026-10-26T08:00:00.000");

  it("ACTIF dont l'instant de retour est passé → en retard", () => {
    expect(isLoanLate({ status: "ACTIF", expectedReturn: DUE }, now)).toBe(true);
  });

  it("ACTIF à rendre demain → pas en retard", () => {
    expect(isLoanLate({ status: "ACTIF", expectedReturn: at("2026-10-27T00:00:00.000") }, now)).toBe(
      false,
    );
  });

  it("RETARD saisi → toujours en retard", () => {
    expect(isLoanLate({ status: "RETARD", expectedReturn: at("2026-11-01T00:00:00.000") }, now)).toBe(
      true,
    );
  });

  it("SECHAGE ou RETOURNE → jamais en retard, même date dépassée", () => {
    expect(isLoanLate({ status: "SECHAGE", expectedReturn: DUE }, now)).toBe(false);
    expect(isLoanLate({ status: "RETOURNE", expectedReturn: DUE }, now)).toBe(false);
  });
});

describe("lateLoanWhere — même règle côté requête Prisma", () => {
  it("borne les ACTIF à l'instant courant", () => {
    const now = at("2026-10-27T08:00:00.000");
    expect(lateLoanWhere(now)).toEqual({
      OR: [{ status: "RETARD" }, { status: "ACTIF", expectedReturn: { lt: now } }],
    });
  });
});

describe("daysLate — jours entiers écoulés depuis l'instant prévu", () => {
  it("0 avant l'échéance et pendant les premières 24 h de retard", () => {
    expect(daysLate(at("2026-10-27T00:00:00.000"), at("2026-10-26T10:00:00.000"))).toBe(0);
    expect(daysLate(DUE, at("2026-10-26T23:59:59.999"))).toBe(0);
  });

  it("1 dès 24 h de retard", () => {
    expect(daysLate(DUE, at("2026-10-27T00:00:00.000"))).toBe(1);
    expect(daysLate(at("2026-10-26T15:00:00.000"), at("2026-10-27T14:59:59.999"))).toBe(0);
    expect(daysLate(at("2026-10-26T15:00:00.000"), at("2026-10-27T15:00:00.000"))).toBe(1);
  });

  it("compte les jours entiers", () => {
    expect(daysLate(DUE, at("2026-10-30T12:00:00.000"))).toBe(4);
  });
});

describe("changements de mois et d'année", () => {
  it("fin de mois : 31/10 → en retard dès 00:00 passé le 31/10, 1 jour le 01/11", () => {
    const due = at("2026-10-31T00:00:00.000");
    expect(isPastDue(due, at("2026-10-30T23:59:59.999"))).toBe(false);
    expect(isPastDue(due, at("2026-10-31T00:00:00.001"))).toBe(true);
    expect(daysLate(due, at("2026-11-01T00:00:00.000"))).toBe(1);
  });

  it("fin d'année : 31/12 → 1 jour le 01/01", () => {
    const due = at("2026-12-31T00:00:00.000");
    expect(isPastDue(due, at("2026-12-31T08:00:00.000"))).toBe(true);
    expect(daysLate(due, at("2027-01-01T00:00:00.000"))).toBe(1);
  });

  it("février bissextile : 28/02/2028 → 29/02 = 1 jour, 01/03 = 2 jours", () => {
    const due = at("2028-02-28T00:00:00.000");
    expect(daysLate(due, at("2028-02-29T12:00:00.000"))).toBe(1);
    expect(daysLate(due, at("2028-03-01T12:00:00.000"))).toBe(2);
  });

  it("changement d'heure (mars/octobre) : les jours muraux restent entiers", () => {
    expect(daysLate(at("2026-03-28T00:00:00.000"), at("2026-03-30T10:00:00.000"))).toBe(2);
    expect(daysLate(at("2026-10-24T00:00:00.000"), at("2026-10-27T10:00:00.000"))).toBe(3);
  });
});

describe("cohérence entre les formes de la règle", () => {
  const nows = [
    "2026-10-26T00:00:00.000",
    "2026-10-26T00:00:00.001",
    "2026-10-26T23:59:59.999",
    "2026-10-27T00:00:00.000",
    "2026-12-31T23:59:59.999",
    "2027-01-01T00:00:00.000",
  ].map(at);
  const dues = [
    "2026-10-25T00:00:00.000",
    "2026-10-26T00:00:00.000",
    "2026-10-26T15:00:00.000",
    "2026-10-27T00:00:00.000",
    "2026-12-31T00:00:00.000",
    "2027-01-02T00:00:00.000",
  ].map(at);
  const statuses = ["ACTIF", "RETARD", "SECHAGE", "RETOURNE"];

  // Évalue le filtre Prisma lateLoanWhere en mémoire.
  const matchesWhere = (loan: { status: string; expectedReturn: Date }, now: Date) => {
    const where = lateLoanWhere(now) as {
      OR: { status: string; expectedReturn?: { lt: Date } }[];
    };
    return where.OR.some(
      (c) =>
        c.status === loan.status && (!c.expectedReturn || loan.expectedReturn < c.expectedReturn.lt),
    );
  };

  it("isLoanLate ⇔ lateLoanWhere sur une grille statut × échéance × now", () => {
    for (const now of nows)
      for (const expectedReturn of dues)
        for (const status of statuses) {
          const loan = { status, expectedReturn };
          expect(matchesWhere(loan, now), `${status} ${expectedReturn.toISOString()} @ ${now.toISOString()}`).toBe(
            isLoanLate(loan, now),
          );
        }
  });

  it("daysLate ≥ 1 ⇒ isPastDue", () => {
    for (const now of nows)
      for (const due of dues) {
        if (daysLate(due, now) >= 1) {
          expect(isPastDue(due, now), `${due.toISOString()} @ ${now.toISOString()}`).toBe(true);
        }
      }
  });
});
