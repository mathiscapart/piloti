import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { UNITS } from "@/lib/enums";

// US-P02 — calendrier : liste des événements, filtrables par unité et par type.
// Par défaut on montre l'à-venir (fin ≥ aujourd'hui) ; `scope: "past"` renvoie
// l'historique (passés, du plus récent au plus ancien).
export interface EventFilter {
  unit?: string;
  type?: string;
  scope?: "upcoming" | "past";
}

export async function listEvents(opts: EventFilter = {}) {
  const now = new Date();
  const where: Prisma.EventWhereInput = {};

  if (opts.unit && (UNITS as readonly string[]).includes(opts.unit)) {
    where.unit = opts.unit;
  }
  if (opts.type) where.type = opts.type;

  if (opts.scope === "past") {
    where.endDate = { lt: now };
    return db.event.findMany({ where, orderBy: { startDate: "desc" } });
  }

  where.endDate = { gte: now };
  return db.event.findMany({ where, orderBy: { startDate: "asc" } });
}

export type EventListItem = Awaited<ReturnType<typeof listEvents>>[number];

export async function getEvent(id: string) {
  return db.event.findUnique({ where: { id } });
}

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEvent>>>;

function hasRole(rolesJson: string, role: string): boolean {
  try {
    return (JSON.parse(rolesJson) as string[]).includes(role);
  } catch {
    return false;
  }
}

// US-P05/P07 — jeunes actifs concernés par un événement : toute la branche
// ciblée, ou tout le groupe si l'événement n'a pas d'unité (unit === null).
async function getEligibleScouts(unit: string | null) {
  const jeunes = await db.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { contains: "SCOUT" },
      ...(unit ? { unit } : {}),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      image: true,
      unit: true,
      roles: true,
    },
  });
  return jeunes.filter((u) => hasRole(u.roles, "SCOUT"));
}

// US-P04/P05 — détail enrichi : l'événement, la liste des réponses (pour les
// chefs) et la réponse de l'utilisateur courant (pour le contrôle
// d'inscription). `awaiting` : jeunes éligibles n'ayant donné aucune réponse
// (« en attente », US-P05 — ce n'est pas un statut stocké, juste l'écart entre
// le roster attendu et les inscriptions). `addable` : jeunes qu'un chef peut
// inscrire manuellement (aucune inscription active — absente ou désistée).
export async function getEventWithRegistrations(id: string, userId: string) {
  const event = await db.event.findUnique({ where: { id } });
  if (!event) return null;

  const [registrations, reminders, eligible] = await Promise.all([
    db.eventRegistration.findMany({
      where: { eventId: id },
      orderBy: [{ createdAt: "asc" }],
      select: {
        response: true,
        status: true,
        comment: true,
        withdrawalReason: true,
        user: {
          select: { id: true, firstName: true, lastName: true, image: true, unit: true },
        },
      },
    }),
    db.eventReminder.findMany({
      where: { eventId: id },
      orderBy: [{ sentAt: "asc" }],
      select: {
        sentAt: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    getEligibleScouts(event.unit),
  ]);

  const mine = registrations.find((r) => r.user.id === userId);
  const myResponse = mine?.response ?? null;
  const myStatus = mine?.status ?? null;
  const myWithdrawalReason = mine?.withdrawalReason ?? null;

  const registeredIds = new Set(registrations.map((r) => r.user.id));
  const activeIds = new Set(
    registrations.filter((r) => r.status !== "WITHDRAWN").map((r) => r.user.id),
  );
  const awaiting = eligible.filter((u) => !registeredIds.has(u.id));
  const addable = eligible.filter((u) => !activeIds.has(u.id));

  return {
    event,
    registrations,
    reminders,
    myResponse,
    myStatus,
    myWithdrawalReason,
    expectedCount: eligible.length,
    awaiting,
    addable,
  };
}

export type EventRegistrationEntry = Awaited<
  ReturnType<typeof getEventWithRegistrations>
>;

// US-P07 — feuille de pointage : les jeunes concernés par l'événement (unité
// ciblée, ou toutes si événement de groupe) avec leur présence relevée.
// `present` : true/false si pointé, null si pas encore pointé.
export async function getAttendanceRoster(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, unit: true, startDate: true, endDate: true },
  });
  if (!event) return null;

  const [jeunes, attendance] = await Promise.all([
    getEligibleScouts(event.unit),
    db.attendance.findMany({
      where: { eventId },
      select: { userId: true, present: true },
    }),
  ]);

  const map = new Map(attendance.map((a) => [a.userId, a.present]));
  const roster = jeunes.map((u) => ({
    user: {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      image: u.image,
      unit: u.unit,
    },
    present: map.get(u.id) ?? null,
  }));

  return { event, roster };
}

export type AttendanceRoster = NonNullable<
  Awaited<ReturnType<typeof getAttendanceRoster>>
>;

// Compteur de présents (pour le résumé sur la fiche événement).
export async function getAttendanceCount(eventId: string) {
  return db.attendance.count({ where: { eventId, present: true } });
}

// US-P12 — matériel mobilisé : les lignes de prêt rattachées à un événement.
export async function getEventLoans(eventId: string) {
  return db.loan.findMany({
    where: { eventId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      groupId: true,
      quantity: true,
      startDate: true,
      expectedReturn: true,
      status: true,
      equipment: { select: { id: true, name: true } },
      borrower: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export type EventLoan = Awaited<ReturnType<typeof getEventLoans>>[number];

// Compteur d'événements à venir (badge dashboard / nav éventuel).
export async function countUpcomingEvents() {
  return db.event.count({ where: { endDate: { gte: new Date() } } });
}
