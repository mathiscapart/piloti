import { db } from "@/lib/db";

import { canonicalPair } from "./dm";
import { evaluateDmPolicy, type DmParticipant } from "./dm-policy";

// SAFE-01 — champs nécessaires à `evaluateDmPolicy` pour un compte donné.
const DM_PARTICIPANT_SELECT = {
  role: true,
  roles: true,
  unit: true,
  birthDate: true,
} as const;

type DmParticipantRow = {
  role: string;
  roles: string;
  unit: string | null;
  birthDate: Date | null;
};

export function toDmParticipant(u: DmParticipantRow): DmParticipant {
  return { role: u.role, roles: u.roles, unit: u.unit, birthDate: u.birthDate };
}

// SAFE-01 — lien familial entre deux comptes, quel que soit le sens
// (parent → enfant ou enfant → parent). Toujours autorisé pour la messagerie.
export async function isFamilyLinked(aId: string, bId: string): Promise<boolean> {
  const link = await db.familyLink.findFirst({
    where: {
      OR: [
        { parentId: aId, childId: bId },
        { parentId: bId, childId: aId },
      ],
    },
    select: { id: true },
  });
  return link !== null;
}

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
// SAFE-01 — un fil interdit par la protection des mineurs est traité comme
// inexistant (même `null` qu'un destinataire introuvable) : pas d'énumération
// d'identités possible via cette Server Action.
export async function getThread(
  userId: string,
  otherId: string,
): Promise<Thread | null> {
  const [me, other] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: DM_PARTICIPANT_SELECT }),
    db.user.findUnique({
      where: { id: otherId },
      select: { id: true, firstName: true, lastName: true, status: true, ...DM_PARTICIPANT_SELECT },
    }),
  ]);
  if (!me || !other || other.status !== "ACTIVE" || other.id === userId) return null;

  const familyLinked = await isFamilyLinked(userId, otherId);
  const verdict = evaluateDmPolicy(toDmParticipant(me), toDmParticipant(other), familyLinked);
  if (!verdict.allowed) return null;

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

// US-C04 — destinataires possibles d'un nouveau message (membres actifs, hors
// soi). SAFE-01 — n'expose que les comptes avec lesquels `userId` a le droit
// d'échanger en privé (annuaire filtré, pas juste une restriction à l'envoi).
export async function listContacts(userId: string): Promise<ContactOption[]> {
  const me = await db.user.findUnique({ where: { id: userId }, select: DM_PARTICIPANT_SELECT });
  if (!me) return [];
  const meParticipant = toDmParticipant(me);

  const users = await db.user.findMany({
    where: { status: "ACTIVE", id: { not: userId } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, ...DM_PARTICIPANT_SELECT },
  });
  if (users.length === 0) return [];

  // Un seul aller-retour base pour tous les liens familiaux de `userId`,
  // qu'il soit parent ou enfant.
  const links = await db.familyLink.findMany({
    where: { OR: [{ parentId: userId }, { childId: userId }] },
    select: { parentId: true, childId: true },
  });
  const linkedIds = new Set(links.map((l) => (l.parentId === userId ? l.childId : l.parentId)));

  return users
    .filter((u) => evaluateDmPolicy(meParticipant, toDmParticipant(u), linkedIds.has(u.id)).allowed)
    .map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
    }));
}
