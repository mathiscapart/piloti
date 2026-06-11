import "server-only";

import { db } from "@/lib/db";
import { publishChannelEvent } from "@/lib/realtime";
import { resolveUnitAudience } from "@/modules/audience/unit-audience";
import { notifyMany } from "@/modules/notifications/notify";

import { formatEventRange } from "./format";
import {
  CONSECUTIVE_ABSENCE_THRESHOLD,
  getMemberAttendanceStats,
} from "./stats";

// Fixations logiques — événement ↔ communication.
// À la création / modification / annulation d'un événement, on :
//   1) notifie l'audience de l'unité (jeunes + parents + membres) — UNE notif
//      claire, selon les préférences ;
//   2) poste un message d'info dans le salon de l'unité, SANS re-notifier le
//      salon (évite le double-ping).

export type EventChange = "created" | "updated" | "cancelled";

interface EventData {
  id: string;
  name: string;
  unit: string | null;
  startDate: Date;
  endDate: Date;
  location: string | null;
}

const CONFIG: Record<
  EventChange,
  { emoji: string; verb: string; link: (id: string) => string }
> = {
  created: { emoji: "📅", verb: "Nouvel événement", link: (id) => `/planning/${id}` },
  updated: { emoji: "✏️", verb: "Événement modifié", link: (id) => `/planning/${id}` },
  cancelled: { emoji: "❌", verb: "Événement annulé", link: () => "/planning" },
};

export async function notifyEventAudience(
  event: EventData,
  actorId: string,
  change: EventChange,
): Promise<void> {
  const audience = await resolveUnitAudience(event.unit);
  const cfg = CONFIG[change];
  const range = formatEventRange(event.startDate, event.endDate);
  const detail = `${range}${event.location ? ` · ${event.location}` : ""}`;

  // 1) Notification dédiée (cloche + email + push selon préférences).
  const recipients = audience.allIds.filter((id) => id !== actorId);
  if (recipients.length > 0) {
    await notifyMany(recipients, (userId) => ({
      userId,
      type: "EVENT_UPDATE",
      title: `${cfg.emoji} ${cfg.verb} : ${event.name}`,
      body: detail,
      link: cfg.link(event.id),
      messageId: event.id,
    }));
  }

  // 2) Message d'info dans le salon de l'unité (pas de notification de salon).
  if (audience.channelId) {
    const msg = await db.message.create({
      data: {
        channelId: audience.channelId,
        authorId: actorId,
        body: `${cfg.emoji} ${cfg.verb} : ${event.name} — ${detail}`,
        attachments: "[]",
      },
    });
    publishChannelEvent({
      type: "message",
      channelId: audience.channelId,
      payload: { id: msg.id },
    });
  }
}

// US-P08 — après un pointage « absent », alerte les parents si le jeune atteint
// le seuil d'absences consécutives. Dédupliqué par (événement, jeune) pour ne
// pas spammer lors de re-pointages.
export async function maybeAlertAbsences(
  eventId: string,
  youthId: string,
): Promise<void> {
  const stats = await getMemberAttendanceStats(youthId);
  if (!stats || stats.consecutiveAbsences < CONSECUTIVE_ABSENCE_THRESHOLD) {
    return;
  }

  const dedupKey = `absence:${eventId}:${youthId}`;
  const already = await db.notification.findFirst({
    where: { type: "ATTENDANCE_ALERT", messageId: dedupKey },
    select: { id: true },
  });
  if (already) return;

  const [links, youth] = await Promise.all([
    db.familyLink.findMany({
      where: { childId: youthId },
      select: { parentId: true },
    }),
    db.user.findUnique({
      where: { id: youthId },
      select: { firstName: true, lastName: true },
    }),
  ]);
  const parentIds = links.map((l) => l.parentId);
  if (parentIds.length === 0 || !youth) return;

  const name = `${youth.firstName} ${youth.lastName}`;
  await notifyMany(parentIds, (userId) => ({
    userId,
    type: "ATTENDANCE_ALERT",
    title: `Absences répétées : ${name}`,
    body: `${name} cumule ${stats.consecutiveAbsences} absences consécutives aux activités.`,
    link: `/membres/${youthId}`,
    messageId: dedupKey,
  }));
}

// US-P11 — une tâche ouverte au groupe : annonce dans le salon général pour
// mobiliser des volontaires (best-effort, sans notification de salon).
export async function postGroupTaskToChannel(
  title: string,
  actorId: string,
): Promise<void> {
  const audience = await resolveUnitAudience(null); // groupe → #general
  if (!audience.channelId) return;
  const msg = await db.message.create({
    data: {
      channelId: audience.channelId,
      authorId: actorId,
      body: `📋 Nouvelle tâche du groupe : ${title} — inscris-toi pour aider !`,
      attachments: "[]",
    },
  });
  publishChannelEvent({
    type: "message",
    channelId: audience.channelId,
    payload: { id: msg.id },
  });
}

// US-P12 — un prêt rattaché à un événement : annonce le matériel mobilisé dans
// le salon de l'unité concernée (best-effort, sans notification de salon).
export async function postLoanToEventChannel(
  eventUnit: string | null,
  eventName: string,
  summary: string,
  actorId: string,
): Promise<void> {
  const audience = await resolveUnitAudience(eventUnit);
  if (!audience.channelId) return;
  const msg = await db.message.create({
    data: {
      channelId: audience.channelId,
      authorId: actorId,
      body: `🎒 Matériel réservé pour ${eventName} : ${summary}`,
      attachments: "[]",
    },
  });
  publishChannelEvent({
    type: "message",
    channelId: audience.channelId,
    payload: { id: msg.id },
  });
}
