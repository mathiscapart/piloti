"use server";

import { after } from "next/server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { publishUserEvent } from "@/lib/realtime";
import type { ActionResult } from "@/lib/types";
import { notify } from "@/modules/notifications/notify";

import { canonicalPair } from "./dm";
import {
  getThread,
  listConversations,
  type ConversationSummary,
  type Thread,
} from "./dm-queries";

async function getOrCreateConversation(meId: string, otherId: string) {
  const [a, b] = canonicalPair(meId, otherId);
  const where = { userAId_userBId: { userAId: a, userBId: b } } as const;
  const existing = await db.conversation.findUnique({ where });
  if (existing) return existing;
  try {
    return await db.conversation.create({ data: { userAId: a, userBId: b } });
  } catch {
    // Course (création concurrente) → la conversation existe maintenant.
    const c = await db.conversation.findUnique({ where });
    if (c) return c;
    throw new Error("Conversation introuvable.");
  }
}

// US-C04 — envoie un message privé à `otherId`. Crée la conversation au besoin,
// notifie le destinataire (temps réel + cloche + email + push).
export async function sendDirectMessage(
  otherId: string,
  body: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const text = (body ?? "").trim();
  if (text.length === 0) return { error: "Message vide." };
  if (text.length > 4000) return { error: "Message trop long." };
  if (otherId === user.id) return { error: "Destinataire invalide." };

  const other = await db.user.findUnique({
    where: { id: otherId },
    select: { status: true },
  });
  if (!other || other.status !== "ACTIVE") {
    return { error: "Destinataire introuvable." };
  }

  const convo = await getOrCreateConversation(user.id, otherId);
  await db.directMessage.create({
    data: { conversationId: convo.id, senderId: user.id, body: text },
  });
  // (La liste est triée par date du dernier message, pas besoin de bump.)

  // Temps réel : rafraîchit la messagerie des deux côtés.
  publishUserEvent(otherId, { type: "dm", payload: { from: user.id } });
  publishUserEvent(user.id, { type: "dm", payload: { to: otherId } });

  // Notification (cloche + email + push), coalescée par conversation. `after()`
  // garantit l'exécution APRÈS la réponse (un `void` non-attendu pouvait être
  // coupé avant l'envoi push/email).
  after(() =>
    notify({
      userId: otherId,
      type: "DIRECT_MESSAGE",
      title: `${user.firstName} ${user.lastName}`,
      body: text.slice(0, 160),
      link: `/messages/${user.id}`,
      channelId: convo.id,
    }),
  );

  return { error: null };
}

// US-C04 — accusé de lecture : marque lus les messages reçus de `otherId`.
export async function markConversationRead(otherId: string): Promise<void> {
  const user = await getCurrentUser();
  const [a, b] = canonicalPair(user.id, otherId);
  const convo = await db.conversation.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
    select: { id: true },
  });
  if (!convo) return;
  const res = await db.directMessage.updateMany({
    where: { conversationId: convo.id, senderId: otherId, readAt: null },
    data: { readAt: new Date() },
  });
  if (res.count > 0) {
    // Accusé de lecture en direct côté expéditeur + maj de ma propre liste
    // (le compteur de non-lus retombe à 0).
    publishUserEvent(otherId, { type: "dm", payload: { read: true } });
    publishUserEvent(user.id, { type: "dm", payload: { readSelf: true } });
  }
}

// Refetch (appelés par le client sur événement SSE).
export async function fetchConversations(): Promise<ConversationSummary[]> {
  const user = await getCurrentUser();
  return listConversations(user.id);
}

export async function fetchThread(otherId: string): Promise<Thread | null> {
  const user = await getCurrentUser();
  return getThread(user.id, otherId);
}
