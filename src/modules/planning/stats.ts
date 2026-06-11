import "server-only";

import { db } from "@/lib/db";

// US-P08 / US-P09 — statistiques de présence à partir des pointages (US-P07).
//
// Principe : on ne compte que les événements PASSÉS et RÉELLEMENT POINTÉS
// (au moins une présence relevée). Pour un événement pointé, un jeune est
// « présent » s'il a une ligne Attendance present=true, sinon « absent ».
// Les événements de groupe (unit = null) comptent pour toutes les unités.

// Seuil d'absences consécutives déclenchant une alerte (configurable).
const CONSECUTIVE_ABSENCE_THRESHOLD =
  Number(process.env.ABSENCE_ALERT_THRESHOLD) || 3;

export { CONSECUTIVE_ABSENCE_THRESHOLD };

interface PointedEvent {
  id: string;
  name: string;
  startDate: Date;
}

// Événements passés et pointés concernant une unité (+ événements de groupe),
// avec la map des présences (eventId → set des userId présents).
async function getPointedEventsForUnit(unit: string | null): Promise<{
  events: PointedEvent[];
  presentByEvent: Map<string, Set<string>>;
}> {
  const now = new Date();
  const events = await db.event.findMany({
    where: {
      endDate: { lt: now },
      OR: [{ unit }, { unit: null }],
    },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true },
  });
  if (events.length === 0) {
    return { events: [], presentByEvent: new Map() };
  }

  const eventIds = events.map((e) => e.id);
  const attendance = await db.attendance.findMany({
    where: { eventId: { in: eventIds } },
    select: { eventId: true, userId: true, present: true },
  });

  const pointedIds = new Set(attendance.map((a) => a.eventId));
  const presentByEvent = new Map<string, Set<string>>();
  for (const a of attendance) {
    if (!a.present) continue;
    let set = presentByEvent.get(a.eventId);
    if (!set) {
      set = new Set();
      presentByEvent.set(a.eventId, set);
    }
    set.add(a.userId);
  }

  return {
    events: events.filter((e) => pointedIds.has(e.id)),
    presentByEvent,
  };
}

// Calcule taux + absences consécutives d'un jeune sur une liste d'événements
// pointés (ordre chronologique croissant).
function computeStats(
  userId: string,
  events: PointedEvent[],
  presentByEvent: Map<string, Set<string>>,
) {
  const timeline = events.map((e) => ({
    event: e,
    present: presentByEvent.get(e.id)?.has(userId) ?? false,
  }));
  const total = timeline.length;
  const present = timeline.filter((t) => t.present).length;
  const rate = total > 0 ? Math.round((present / total) * 100) : null;

  let consecutiveAbsences = 0;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].present) break;
    consecutiveAbsences++;
  }

  return { total, present, rate, consecutiveAbsences, timeline };
}

// US-P08 — stats d'un jeune (pour sa fiche).
export async function getMemberAttendanceStats(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { unit: true },
  });
  if (!user) return null;

  const { events, presentByEvent } = await getPointedEventsForUnit(user.unit);
  const stats = computeStats(userId, events, presentByEvent);
  return {
    ...stats,
    // 10 derniers événements pour l'historique récent (du plus récent au plus ancien).
    recent: stats.timeline.slice(-10).reverse(),
    atRisk: stats.consecutiveAbsences >= CONSECUTIVE_ABSENCE_THRESHOLD,
  };
}

export type MemberAttendanceStats = NonNullable<
  Awaited<ReturnType<typeof getMemberAttendanceStats>>
>;

// US-P09 — tableau de bord présences d'une unité.
export async function getUnitAttendanceDashboard(unit: string) {
  const [jeunes, { events, presentByEvent }] = await Promise.all([
    db.user.findMany({
      where: { status: "ACTIVE", roles: { contains: "SCOUT" }, unit },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, image: true, roles: true },
    }),
    getPointedEventsForUnit(unit),
  ]);

  const rows = jeunes
    .filter((u) => {
      try {
        return (JSON.parse(u.roles) as string[]).includes("SCOUT");
      } catch {
        return false;
      }
    })
    .map((u) => {
      const s = computeStats(u.id, events, presentByEvent);
      return {
        user: { id: u.id, firstName: u.firstName, lastName: u.lastName, image: u.image },
        total: s.total,
        present: s.present,
        rate: s.rate,
        consecutiveAbsences: s.consecutiveAbsences,
        atRisk: s.consecutiveAbsences >= CONSECUTIVE_ABSENCE_THRESHOLD,
      };
    });

  const rated = rows.filter((r) => r.rate !== null);
  const averageRate =
    rated.length > 0
      ? Math.round(rated.reduce((sum, r) => sum + (r.rate ?? 0), 0) / rated.length)
      : null;

  return {
    eventCount: events.length,
    averageRate,
    atRiskCount: rows.filter((r) => r.atRisk).length,
    rows,
  };
}

export type UnitAttendanceDashboard = Awaited<
  ReturnType<typeof getUnitAttendanceDashboard>
>;
