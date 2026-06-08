"use server";

import { after } from "next/server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { effectiveRoles } from "@/lib/permissions";
import { publishChannelEvent } from "@/lib/realtime";
import type { ActionResult } from "@/lib/types";
import { notifyMany } from "@/modules/notifications/notify";

import { canAccessChannel, canWriteChannel } from "./access";

interface ChannelLike {
  id: string;
  name: string;
  slug: string;
  accessRoles: string;
  accessUnits: string;
  excludeUnits: string;
  archived?: boolean;
}

// US-C09 — notifie les membres d'un salon d'un nouveau message : tous les ACTIVE
// qui ont accès au salon, sauf l'auteur et ceux qui l'ont mis en sourdine.
async function notifyChannelMessage(
  channel: ChannelLike,
  author: { id: string; firstName: string },
  body: string,
  messageId: string,
): Promise<void> {
  const [users, mutes] = await Promise.all([
    db.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, role: true, roles: true, unit: true },
    }),
    db.channelMute.findMany({
      where: { channelId: channel.id },
      select: { userId: true },
    }),
  ]);
  const muted = new Set(mutes.map((m) => m.userId));

  const recipients = users
    .filter((u) => u.id !== author.id)
    .filter((u) => !muted.has(u.id))
    .filter((u) => canAccessChannel(u, channel))
    .map((u) => u.id);
  if (recipients.length === 0) return;

  const snippet =
    body.trim().length > 0
      ? body.trim().slice(0, 120)
      : "📎 a envoyé une pièce jointe";
  const link = `/communication/${channel.slug}`;

  await notifyMany(recipients, (userId) => ({
    userId,
    type: "CHANNEL_MESSAGE",
    title: `#${channel.name}`,
    body: `${author.firstName} : ${snippet}`,
    link,
    channelId: channel.id,
    messageId,
  }));
}

// Note : les messages de chat ne sont PAS tracés dans AuditLog (volume élevé,
// non sensible ; ils portent déjà auteur + horodatage). L'audit reste réservé
// aux mutations sensibles (inventaire, comptes…).

function isStaff(user: { role: string; roles?: string[] | string | null }) {
  return effectiveRoles(user).some((r) => r === "ADMIN" || r === "CHEF");
}

export async function postMessage(
  channelId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) return { error: "Salon introuvable." };
  if (!canWriteChannel(user, channel)) {
    return { error: "Tu n'as pas le droit d'écrire dans ce salon." };
  }

  const body = String(formData.get("body") ?? "").trim();
  const attachments = formData
    .getAll("attachments")
    .map(String)
    .filter((s) => s.length > 0);
  if (body.length === 0 && attachments.length === 0) {
    return { error: "Message vide." };
  }

  const msg = await db.message.create({
    data: {
      channelId,
      authorId: user.id,
      body,
      attachments: JSON.stringify(attachments),
    },
  });
  publishChannelEvent({ type: "message", channelId, payload: { id: msg.id } });

  // Notifie les membres du salon (in-app temps réel + email/push selon prefs).
  // `after()` exécute le fan-out APRÈS la réponse de façon garantie (un `void`
  // non-attendu pouvait être coupé avant l'envoi push/email).
  after(() => notifyChannelMessage(channel, user, body, msg.id));

  return { error: null };
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const message = await db.message.findUnique({
    where: { id: messageId },
    include: { channel: true },
  });
  if (!message) return { error: "Message introuvable." };
  if (!canAccessChannel(user, message.channel)) {
    return { error: "Accès refusé." };
  }

  const existing = await db.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: { messageId, userId: user.id, emoji },
    },
  });
  if (existing) {
    await db.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await db.messageReaction.create({
      data: { messageId, userId: user.id, emoji },
    });
  }
  publishChannelEvent({
    type: "reaction",
    channelId: message.channelId,
    payload: { messageId },
  });
  return { error: null };
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message) return { error: "Message introuvable." };
  if (message.authorId !== user.id && !effectiveRoles(user).includes("ADMIN")) {
    return { error: "Tu ne peux éditer que tes propres messages." };
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) return { error: "Message vide." };

  await db.message.update({
    where: { id: messageId },
    data: { body: trimmed, editedAt: new Date() },
  });
  publishChannelEvent({
    type: "edit",
    channelId: message.channelId,
    payload: { messageId },
  });
  return { error: null };
}

export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message) return { error: "Message introuvable." };
  // L'auteur supprime ses propres messages ; l'ADMIN supprime n'importe lequel.
  if (message.authorId !== user.id && !effectiveRoles(user).includes("ADMIN")) {
    return { error: "Tu ne peux supprimer que tes propres messages." };
  }
  // Réactions supprimées en cascade (onDelete: Cascade au schéma).
  await db.message.delete({ where: { id: messageId } });
  publishChannelEvent({
    type: "delete",
    channelId: message.channelId,
    payload: { messageId },
  });
  return { error: null };
}

export async function togglePin(messageId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isStaff(user)) return { error: "Réservé aux chefs." };
  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message) return { error: "Message introuvable." };

  await db.message.update({
    where: { id: messageId },
    data: { pinnedAt: message.pinnedAt ? null : new Date() },
  });
  publishChannelEvent({
    type: "pin",
    channelId: message.channelId,
    payload: { messageId },
  });
  return { error: null };
}

// Recharge les messages d'un salon (appelé par le client sur événement SSE).
// Renvoie null si accès refusé.
export async function loadMessages(channelId: string) {
  const user = await getCurrentUser();
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel || !canAccessChannel(user, channel)) return null;
  const messages = await db.message.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      author: { select: { id: true, firstName: true, lastName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  return messages.reverse();
}

// Marque le salon comme lu pour l'utilisateur (efface l'indicateur non-lu).
export async function markChannelRead(channelId: string): Promise<void> {
  const user = await getCurrentUser();
  await db.channelRead.upsert({
    where: { channelId_userId: { channelId, userId: user.id } },
    create: { channelId, userId: user.id, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}
