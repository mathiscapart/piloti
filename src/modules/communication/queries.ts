import { db } from "@/lib/db";

import { canAccessChannel } from "./access";

interface AccessUser {
  id: string;
  role: string;
  roles?: string[] | string | null;
  unit?: string | null;
}

// US-C09 — arbre des salons accessibles à l'utilisateur, groupés par catégorie,
// avec indicateur de messages non lus. Les salons archivés sont exclus de la
// navigation courante (consultables via la vue archives, hors MVP).
export async function listChannelTree(user: AccessUser) {
  const [categories, channels, reads] = await Promise.all([
    db.channelCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
    db.channel.findMany({
      where: { archived: false },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    db.channelRead.findMany({
      where: { userId: user.id },
      select: { channelId: true, lastReadAt: true },
    }),
  ]);

  const readBy = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));

  const visible = channels
    .filter((c) => canAccessChannel(user, c))
    .map((c) => {
      const last = c.messages[0]?.createdAt ?? null;
      const read = readBy.get(c.id) ?? null;
      const unread = last !== null && (read === null || last > read);
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        categoryId: c.categoryId,
        description: c.description,
        unread,
      };
    });

  // Groupe par catégorie (ordre des catégories), salons sans catégorie en fin.
  const tree = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    channels: visible.filter((c) => c.categoryId === cat.id),
  }));
  const orphan = visible.filter((c) => c.categoryId === null);
  if (orphan.length > 0) {
    tree.push({ id: "__none__", name: "Autres", channels: orphan });
  }
  return tree.filter((cat) => cat.channels.length > 0);
}

export type ChannelTree = Awaited<ReturnType<typeof listChannelTree>>;

// Salon par slug, seulement si accessible à l'utilisateur.
export async function getChannelForUser(user: AccessUser, slug: string) {
  const channel = await db.channel.findUnique({ where: { slug } });
  if (!channel) return null;
  if (!canAccessChannel(user, channel)) return null;
  return channel;
}

// Messages d'un salon (les plus récents), avec auteur + réactions.
export async function listMessages(channelId: string, take = 50) {
  const messages = await db.message.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      author: { select: { id: true, firstName: true, lastName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  // Ordre chronologique pour l'affichage.
  return messages.reverse();
}

export type MessageWithMeta = Awaited<ReturnType<typeof listMessages>>[number];
