import "server-only";

import { db } from "@/lib/db";
import { notificationEmailHtml, sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import { publishUserEvent } from "@/lib/realtime";
import type { NotificationType } from "@/lib/enums";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  channelId?: string | null;
  messageId?: string | null;
}

function absoluteUrl(link?: string | null): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  if (!link) return base;
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

// Coalescence : pour les messages d'un même salon, on regroupe les notifications
// non lues en une seule ligne (« 3 nouveaux messages dans #général ») au lieu
// d'en empiler une par message.
async function upsertNotification(
  input: NotifyInput,
): Promise<{ id: string; isNew: boolean; count: number; body: string }> {
  const coalesces = input.type === "CHANNEL_MESSAGE" && Boolean(input.channelId);

  if (coalesces) {
    const existing = await db.notification.findFirst({
      where: {
        userId: input.userId,
        channelId: input.channelId,
        type: "CHANNEL_MESSAGE",
        readAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      const count = existing.count + 1;
      const body = `${count} nouveaux messages`;
      await db.notification.update({
        where: { id: existing.id },
        data: {
          count,
          body,
          title: input.title,
          link: input.link ?? existing.link,
          messageId: input.messageId ?? existing.messageId,
          createdAt: new Date(),
        },
      });
      return { id: existing.id, isNew: false, count, body };
    }
  }

  const created = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      channelId: input.channelId ?? null,
      messageId: input.messageId ?? null,
    },
  });
  return { id: created.id, isNew: true, count: 1, body: input.body };
}

/**
 * Crée (ou coalesce) une notification pour UN destinataire et la diffuse :
 *  - in-app temps réel (SSE) à chaque fois ;
 *  - email + push UNIQUEMENT à la première notification non lue (anti-spam),
 *    selon les préférences de l'utilisateur.
 * Ne jette jamais : un échec de notification n'interrompt pas l'action métier.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const { isNew, body } = await upsertNotification(input);

    // In-app : signale au client de rafraîchir sa cloche (à chaque message).
    publishUserEvent(input.userId, { type: "notification" });

    if (!isNew) return; // email/push déjà envoyés pour ce regroupement

    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: {
        email: true,
        notificationPref: { select: { emailEnabled: true, pushEnabled: true } },
      },
    });
    if (!user) return;

    const emailEnabled = user.notificationPref?.emailEnabled ?? true;
    const pushEnabled = user.notificationPref?.pushEnabled ?? true;
    const url = absoluteUrl(input.link);

    const tasks: Promise<unknown>[] = [];
    if (emailEnabled) {
      tasks.push(
        sendEmail({
          to: user.email,
          subject: input.title,
          html: notificationEmailHtml({ title: input.title, body, url }),
        }),
      );
    }
    if (pushEnabled) {
      tasks.push(
        sendPushToUser(input.userId, {
          title: input.title,
          body,
          url: input.link ?? "/",
          tag: input.channelId ?? input.type,
        }),
      );
    }
    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("[notify] échec:", err);
  }
}

/** Fan-out vers plusieurs destinataires (ex. tous les membres d'un salon). */
export async function notifyMany(
  userIds: string[],
  factory: (userId: string) => NotifyInput,
): Promise<void> {
  await Promise.allSettled(userIds.map((id) => notify(factory(id))));
}
