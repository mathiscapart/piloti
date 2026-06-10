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

// Compteur d'événements à venir (badge dashboard / nav éventuel).
export async function countUpcomingEvents() {
  return db.event.count({ where: { endDate: { gte: new Date() } } });
}
