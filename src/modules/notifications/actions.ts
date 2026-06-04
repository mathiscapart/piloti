"use server";

import { z } from "zod";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import type { ActionResult } from "@/lib/types";

import { getNotificationSnapshot, type NotificationSnapshot } from "./queries";

// Snapshot pour la cloche (refetch côté client sur événement SSE).
export async function fetchNotifications(): Promise<NotificationSnapshot> {
  const user = await getCurrentUser();
  return getNotificationSnapshot(user.id);
}

// Marque une notification comme lue (idempotent ; ne touche que les siennes).
export async function markNotificationRead(id: string): Promise<void> {
  const user = await getCurrentUser();
  await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}

// Marque toutes les notifications de l'utilisateur comme lues.
export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}

// --- Préférences (email / push) -------------------------------------------

const prefsSchema = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
});

export async function updateNotificationPrefs(
  input: z.infer<typeof prefsSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { error: "Préférences invalides." };

  await db.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });
  return { error: null };
}

// --- Abonnements Web Push --------------------------------------------------

const subSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export async function savePushSubscription(
  input: z.infer<typeof subSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = subSchema.safeParse(input);
  if (!parsed.success) return { error: "Abonnement invalide." };

  await db.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: { userId: user.id, ...parsed.data },
    update: { userId: user.id, p256dh: parsed.data.p256dh, auth: parsed.data.auth },
  });
  return { error: null };
}

export async function deletePushSubscription(
  endpoint: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });
  return { error: null };
}

// --- Mute par salon (US-C09) -----------------------------------------------

export async function toggleChannelMute(
  channelId: string,
): Promise<{ muted: boolean }> {
  const user = await getCurrentUser();
  const existing = await db.channelMute.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (existing) {
    await db.channelMute.delete({ where: { id: existing.id } });
    return { muted: false };
  }
  await db.channelMute.create({ data: { channelId, userId: user.id } });
  return { muted: true };
}
