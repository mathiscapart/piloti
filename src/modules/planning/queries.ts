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

// US-P04 — détail enrichi : l'événement, la liste des réponses (pour les chefs)
// et la réponse de l'utilisateur courant (pour le contrôle d'inscription).
export async function getEventWithRegistrations(id: string, userId: string) {
  const event = await db.event.findUnique({ where: { id } });
  if (!event) return null;

  const registrations = await db.eventRegistration.findMany({
    where: { eventId: id },
    orderBy: [{ createdAt: "asc" }],
    select: {
      response: true,
      user: {
        select: { id: true, firstName: true, lastName: true, image: true, unit: true },
      },
    },
  });

  const myResponse =
    registrations.find((r) => r.user.id === userId)?.response ?? null;

  return { event, registrations, myResponse };
}

export type EventRegistrationEntry = Awaited<
  ReturnType<typeof getEventWithRegistrations>
>;

// Compteur d'événements à venir (badge dashboard / nav éventuel).
export async function countUpcomingEvents() {
  return db.event.count({ where: { endDate: { gte: new Date() } } });
}
