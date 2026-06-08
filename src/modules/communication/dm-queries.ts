import { db } from "@/lib/db";

import { canonicalPair } from "./dm";

export interface ConversationSummary {
  otherId: string;
  otherName: string;
  lastBody: string;
  lastAt: Date;
  lastFromMe: boolean;
  unread: number;
}

// US-C04 — conversations de l'utilisateur, plus récentes en premier, avec aperçu
// du dernier message et compteur de non-lus.
export async function listConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  const convos = await db.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { updatedAt: "desc" },
    include: {
      userA: { select: { id: true, firstName: true, lastName: true } },
      userB: { select: { id: true, firstName: true, lastName: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, senderId: true },
      },
    },
  });
  if (convos.length === 0) return [];

  const unread = await db.directMessage.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: convos.map((c) => c.id) },
      senderId: { not: userId },
      readAt: null,
    },
    _count: { _all: true },
  });
  const unreadById = new Map(unread.map((u) => [u.conversationId, u._count._all]));

  return convos
    .filter((c) => c.messages.length > 0)
    .map((c) => {
      const other = c.userAId === userId ? c.userB : c.userA;
      const last = c.messages[0];
      return {
        otherId: other.id,
        otherName: `${other.firstName} ${other.lastName}`,
        lastBody: last.body,
        lastAt: last.createdAt,
        lastFromMe: last.senderId === userId,
        unread: unreadById.get(c.id) ?? 0,
      };
    })
    // Tri par date du dernier message (le plus récent en tête).
    .sort((x, y) => y.lastAt.getTime() - x.lastAt.getTime());
}

export interface ThreadMessage {
  id: string;
  body: string;
  mine: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export interface Thread {
  otherId: string;
  otherName: string;
  conversationId: string | null;
  messages: ThreadMessage[];
}

// US-C04 — fil 1-to-1 avec `otherId`. `conversationId` null = pas encore de
// message échangé (la conversation sera créée au 1er envoi).
export async function getThread(
  userId: string,
  otherId: string,
): Promise<Thread | null> {
  const other = await db.user.findUnique({
    where: { id: otherId },
    select: { id: true, firstName: true, lastName: true, status: true },
  });
  if (!other || other.status !== "ACTIVE" || other.id === userId) return null;

  const [a, b] = canonicalPair(userId, otherId);
  const convo = await db.conversation.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });

  return {
    otherId: other.id,
    otherName: `${other.firstName} ${other.lastName}`,
    conversationId: convo?.id ?? null,
    messages: (convo?.messages ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === userId,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  };
}

export interface ContactOption {
  id: string;
  name: string;
  role: string;
}

// US-C04 — destinataires possibles d'un nouveau message (membres actifs, hors soi).
export async function listContacts(userId: string): Promise<ContactOption[]> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE", id: { not: userId } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  return users.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`,
    role: u.role,
  }));
}
