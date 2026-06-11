import "server-only";

import { db } from "@/lib/db";
import { publishChannelEvent } from "@/lib/realtime";
import { resolveUnitAudience } from "@/modules/audience/unit-audience";
import { notifyMany } from "@/modules/notifications/notify";

import { formatEventRange } from "./format";

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
