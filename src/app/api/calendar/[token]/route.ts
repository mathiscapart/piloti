import { db } from "@/lib/db";

// US-P02 — flux iCal d'abonnement au calendrier. URL protégée par un jeton
// (pas de cookie : les apps calendrier récupèrent l'URL sans session).
// Les dates sont émises en heure « flottante » (sans Z) pour préserver l'heure
// saisie, cohérent avec le stockage « mural » des événements.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");

// "YYYYMMDDTHHMMSS" depuis les composantes UTC (heure flottante).
function floating(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

// Horodatage réel (instant) en UTC, avec Z.
function stamp(d: Date): string {
  return `${floating(d)}Z`;
}

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

interface IcsEvent {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  description: string | null;
}

function buildIcs(events: IcsEvent[]): string {
  const now = stamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Piloti//Planning//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Piloti — Planning",
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.id}@piloti`,
      `DTSTAMP:${now}`,
      `DTSTART:${floating(ev.startDate)}`,
      `DTEND:${floating(ev.endDate)}`,
      `SUMMARY:${esc(ev.name)}`,
    );
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/i, "");
  if (!clean) return new Response("Not found", { status: 404 });

  const user = await db.user.findUnique({
    where: { calendarToken: clean },
    select: { status: true, unit: true },
  });
  if (!user || user.status !== "ACTIVE") {
    return new Response("Not found", { status: 404 });
  }

  // Événements qui concernent l'utilisateur : ceux de groupe + ceux de sa branche.
  const events = await db.event.findMany({
    where: { OR: [{ unit: null }, { unit: user.unit }] },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      location: true,
      description: true,
    },
  });

  return new Response(buildIcs(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache, max-age=0",
      "Content-Disposition": 'inline; filename="piloti.ics"',
    },
  });
}
