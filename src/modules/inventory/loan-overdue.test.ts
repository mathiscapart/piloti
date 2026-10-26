// Tests de src/modules/inventory/loan-overdue.ts — règle unique du retard de
// prêt (issue #189). Une divergence ici fait se contredire le badge, les
// compteurs, l'alerte et le calcul de disponibilité.

import { describe, expect, it } from "vitest";
import {
  daysLate,
  isLoanLate,
  isPastDue,
  lateLoanWhere,
  overdueCutoff,
} from "./loan-overdue";

// Heures murales : composantes UTC = heure à Paris.
const at = (iso: string) => new Date(`${iso}Z`);
const DUE = at("2026-10-26T00:00:00.000"); // retour prévu le 26/10 (date saisie)

describe("isPastDue — en retard une fois écoulée la journée de retour prévue", () => {
  it("retour prévu hier → en retard", () => {
    expect(isPastDue(at("2026-10-25T00:00:00.000"), at("2026-10-26T10:00:00.000"))).toBe(true);
  });

  it("retour prévu aujourd'hui, juste après minuit → pas en retard", () => {
    expect(isPastDue(DUE, at("2026-10-26T00:00:00.000"))).toBe(false);
    expect(isPastDue(DUE, at("2026-10-26T00:00:01.000"))).toBe(false);
  });

  it("retour prévu aujourd'hui, avant minuit → pas en retard", () => {
    expect(isPastDue(DUE, at("2026-10-26T23:59:59.999"))).toBe(false);
  });

  it("frontière 00:00 du lendemain → en retard", () => {
    expect(isPastDue(DUE, at("2026-10-27T00:00:00.000"))).toBe(true);
  });

  it("retour prévu demain → pas en retard", () => {
    expect(isPastDue(at("2026-10-27T00:00:00.000"), at("2026-10-26T23:59:59.999"))).toBe(false);
  });

  it("une heure dans la date prévue ne change pas le jour (seed : 26/10 15:00)", () => {
    const due = at("2026-10-26T15:00:00.000");
    expect(isPastDue(due, at("2026-10-26T23:00:00.000"))).toBe(false);
    expect(isPastDue(due, at("2026-10-27T00:00:00.000"))).toBe(true);
  });
});

describe("overdueCutoff", () => {
  it("renvoie le début du jour mural courant", () => {
    expect(overdueCutoff(at("2026-10-26T17:42:10.123"))).toEqual(DUE);
    expect(overdueCutoff(DUE)).toEqual(DUE);
  });
});

describe("isLoanLate — statut + date", () => {
  const now = at("2026-10-27T08:00:00.000");

  it("ACTIF dont la journée de retour est écoulée → en retard", () => {
    expect(isLoanLate({ status: "ACTIF", expectedReturn: DUE }, now)).toBe(true);
  });

  it("ACTIF à rendre aujourd'hui → pas en retard", () => {
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
  it("borne les ACTIF au début du jour mural courant", () => {
    expect(lateLoanWhere(at("2026-10-27T08:00:00.000"))).toEqual({
      OR: [
        { status: "RETARD" },
        { status: "ACTIF", expectedReturn: { lt: at("2026-10-27T00:00:00.000") } },
      ],
    });
  });
});

describe("daysLate — jours calendaires écoulés depuis le jour prévu", () => {
  it("0 tant que la journée prévue n'est pas écoulée", () => {
    expect(daysLate(DUE, at("2026-10-26T23:59:59.999"))).toBe(0);
    expect(daysLate(at("2026-10-27T00:00:00.000"), at("2026-10-26T10:00:00.000"))).toBe(0);
  });

  it("1 dès 00:00 le lendemain, quelle que soit l'heure prévue", () => {
    expect(daysLate(DUE, at("2026-10-27T00:00:00.000"))).toBe(1);
    expect(daysLate(at("2026-10-26T15:00:00.000"), at("2026-10-27T01:00:00.000"))).toBe(1);
  });

  it("compte les jours entiers", () => {
    expect(daysLate(DUE, at("2026-10-30T12:00:00.000"))).toBe(4);
  });
});

describe("changements de mois et d'année", () => {
  it("fin de mois : 31/10 → en retard dès 00:00 le 01/11", () => {
    const due = at("2026-10-31T00:00:00.000");
    expect(isPastDue(due, at("2026-10-31T23:59:59.999"))).toBe(false);
    expect(isPastDue(due, at("2026-11-01T00:00:00.000"))).toBe(true);
    expect(daysLate(due, at("2026-11-01T00:00:00.000"))).toBe(1);
  });

  it("fin d'année : 31/12 → en retard dès 00:00 le 01/01", () => {
    const due = at("2026-12-31T00:00:00.000");
    expect(isPastDue(due, at("2026-12-31T23:59:59.999"))).toBe(false);
    expect(isPastDue(due, at("2027-01-01T00:00:00.000"))).toBe(true);
    expect(daysLate(due, at("2027-01-01T00:00:00.000"))).toBe(1);
  });

  it("février bissextile : 28/02/2028 → 29/02 = 1 jour, 01/03 = 2 jours", () => {
    const due = at("2028-02-28T00:00:00.000");
    expect(daysLate(due, at("2028-02-29T12:00:00.000"))).toBe(1);
    expect(daysLate(due, at("2028-03-01T12:00:00.000"))).toBe(2);
  });

  it("changement d'heure (mars/octobre) : les jours murs restent entiers", () => {
    expect(daysLate(at("2026-03-28T00:00:00.000"), at("2026-03-30T10:00:00.000"))).toBe(2);
    expect(daysLate(at("2026-10-24T00:00:00.000"), at("2026-10-27T10:00:00.000"))).toBe(3);
  });
});

describe("cohérence entre les formes de la règle", () => {
  const nows = [
    "2026-10-26T00:00:00.000",
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

  it("daysLate ≥ 1 ⇔ isPastDue", () => {
    for (const now of nows)
      for (const due of dues) {
        expect(daysLate(due, now) >= 1, `${due.toISOString()} @ ${now.toISOString()}`).toBe(
          isPastDue(due, now),
        );
      }
  });

  it("overdueCutoff est idempotent et à minuit", () => {
    for (const now of nows) {
      const c = overdueCutoff(now);
      expect(overdueCutoff(c)).toEqual(c);
      expect(c.getTime() % (24 * 60 * 60 * 1000)).toBe(0);
    }
  });
});
