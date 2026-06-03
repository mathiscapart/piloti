"use server";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { effectiveRoles } from "@/lib/permissions";
import { publishChannelEvent } from "@/lib/realtime";
import type { ActionResult } from "@/lib/types";

import { canAccessChannel, canWriteChannel } from "./access";

function isClosed(poll: { closedAt: Date | null; closesAt: Date | null }) {
  if (poll.closedAt) return true;
  if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) return true;
  return false;
}

// US-C06 — crée un sondage dans un salon. options = libellés ; on génère un id
// par option. closesAt optionnel (clôture auto).
export async function createPoll(
  channelId: string,
  input: {
    question: string;
    options: string[];
    allowMultiple?: boolean;
    closesAt?: string | null;
  },
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) return { error: "Salon introuvable." };
  if (!canWriteChannel(user, channel)) {
    return { error: "Tu n'as pas le droit de créer un sondage ici." };
  }

  const question = input.question.trim();
  const options = input.options
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .map((label) => ({ id: randomUUID().slice(0, 8), label }));
  if (question.length === 0) return { error: "Pose une question." };
  if (options.length < 2) return { error: "Ajoute au moins deux options." };

  const poll = await db.poll.create({
    data: {
      channelId,
      authorId: user.id,
      question,
      options: JSON.stringify(options),
      allowMultiple: !!input.allowMultiple,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
    },
  });
  publishChannelEvent({ type: "poll", channelId, payload: { id: poll.id } });
  return { error: null };
}

export async function votePoll(
  pollId: string,
  optionId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    include: { channel: true },
  });
  if (!poll) return { error: "Sondage introuvable." };
  if (!canAccessChannel(user, poll.channel)) return { error: "Accès refusé." };
  if (isClosed(poll)) return { error: "Ce sondage est clôturé." };

  const options = JSON.parse(poll.options) as { id: string; label: string }[];
  if (!options.some((o) => o.id === optionId)) {
    return { error: "Option invalide." };
  }

  const existing = await db.pollVote.findUnique({
    where: { pollId_userId_optionId: { pollId, userId: user.id, optionId } },
  });

  if (poll.allowMultiple) {
    // Toggle de l'option.
    if (existing) {
      await db.pollVote.delete({ where: { id: existing.id } });
    } else {
      await db.pollVote.create({ data: { pollId, userId: user.id, optionId } });
    }
  } else {
    // Choix unique : on remplace le vote précédent (toggle si même option).
    await db.pollVote.deleteMany({ where: { pollId, userId: user.id } });
    if (!existing) {
      await db.pollVote.create({ data: { pollId, userId: user.id, optionId } });
    }
  }

  publishChannelEvent({
    type: "poll",
    channelId: poll.channelId,
    payload: { id: pollId },
  });
  return { error: null };
}

export async function closePoll(pollId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const poll = await db.poll.findUnique({ where: { id: pollId } });
  if (!poll) return { error: "Sondage introuvable." };
  const staff = effectiveRoles(user).some((r) => r === "ADMIN" || r === "CHEF");
  if (poll.authorId !== user.id && !staff) {
    return { error: "Réservé à l'auteur ou aux chefs." };
  }

  await db.poll.update({ where: { id: pollId }, data: { closedAt: new Date() } });
  publishChannelEvent({
    type: "poll",
    channelId: poll.channelId,
    payload: { id: pollId },
  });
  return { error: null };
}

// Sondages d'un salon (avec votes), pour l'affichage + refetch SSE.
export async function loadPolls(channelId: string) {
  const user = await getCurrentUser();
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel || !canAccessChannel(user, channel)) return null;
  const polls = await db.poll.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { firstName: true, lastName: true } },
      votes: { select: { optionId: true, userId: true } },
    },
  });

  // Auto-clôture des sondages dont la date d'échéance est passée (pas de cron).
  // On persiste `closedAt` pour que le client lise un état simple.
  const now = new Date();
  const expired = polls.filter(
    (p) => !p.closedAt && p.closesAt && p.closesAt.getTime() <= now.getTime(),
  );
  if (expired.length > 0) {
    await db.poll.updateMany({
      where: { id: { in: expired.map((p) => p.id) } },
      data: { closedAt: now },
    });
    for (const p of polls) {
      if (expired.some((e) => e.id === p.id)) p.closedAt = now;
    }
  }
  return polls;
}

export type PollWithVotes = NonNullable<
  Awaited<ReturnType<typeof loadPolls>>
>[number];
