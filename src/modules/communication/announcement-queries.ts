import { db } from "@/lib/db";
import { can, effectiveRoles } from "@/lib/permissions";

import { audienceMatches, audienceUserIds } from "./audience";

interface ViewerUser {
  id: string;
  role: string;
  roles?: string[] | string | null;
  unit?: string | null;
  status?: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  attachments: string[];
  audience: string;
  urgent: boolean;
  createdAt: Date;
  authorId: string;
  authorName: string;
  canManage: boolean;
  // US-C03 — taux de lecture, présent uniquement pour les annonces gérables.
  stats: { read: number; total: number } | null;
}

// US-C01/C03 — annonces visibles par l'utilisateur. Un encadrant (publish) ou
// ADMIN voit tout (gestion) ; sinon visibilité selon l'audience. Les annonces
// gérables portent leur taux de lecture (lu / audience).
export async function listAnnouncementsForUser(
  user: ViewerUser,
): Promise<AnnouncementItem[]> {
  const rows = await db.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      author: { select: { firstName: true, lastName: true } },
    },
  });

  const roles = effectiveRoles(user);
  const isStaff = can(user, "announcement.publish");
  const isAdmin = roles.includes("ADMIN");

  const visible = (audience: string) => {
    if (isStaff || isAdmin) return true;
    if (audience === "ALL") return true;
    if (audience === "PARENTS") return roles.includes("PARENT");
    return user.unit === audience;
  };

  const items = rows.filter((a) => visible(a.audience));
  const managed = items.filter((a) => isAdmin || a.authorId === user.id);

  // Stats de lecture (US-C03) — calculées seulement s'il y a des annonces gérées.
  const statsById = new Map<string, { read: number; total: number }>();
  if (managed.length > 0) {
    const [activeUsers, readGroups] = await Promise.all([
      db.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, role: true, roles: true, unit: true },
      }),
      db.announcementRead.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: managed.map((a) => a.id) } },
        _count: { _all: true },
      }),
    ]);
    const readCountById = new Map(
      readGroups.map((g) => [g.announcementId, g._count._all]),
    );
    for (const a of managed) {
      const total = audienceUserIds(activeUsers, a.audience, a.authorId).length;
      statsById.set(a.id, { read: readCountById.get(a.id) ?? 0, total });
    }
  }

  return items.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    attachments: safeParse(a.attachments),
    audience: a.audience,
    urgent: a.urgent,
    createdAt: a.createdAt,
    authorId: a.authorId,
    authorName: `${a.author.firstName} ${a.author.lastName}`,
    canManage: isAdmin || a.authorId === user.id,
    stats: statsById.get(a.id) ?? null,
  }));
}

export interface ReaderEntry {
  id: string;
  name: string;
  read: boolean;
}

// US-C03 — détail lecteurs / non-lecteurs d'une annonce (pour le chef/auteur).
export async function getAnnouncementReaders(
  announcementId: string,
): Promise<ReaderEntry[]> {
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId },
    select: { audience: true, authorId: true },
  });
  if (!announcement) return [];

  const [activeUsers, reads] = await Promise.all([
    db.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, role: true, roles: true, unit: true, firstName: true, lastName: true },
    }),
    db.announcementRead.findMany({
      where: { announcementId },
      select: { userId: true },
    }),
  ]);
  const readers = new Set(reads.map((r) => r.userId));

  return activeUsers
    .filter(
      (u) =>
        u.id !== announcement.authorId &&
        audienceMatches(u, announcement.audience),
    )
    .map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      read: readers.has(u.id),
    }))
    .sort((a, b) => Number(a.read) - Number(b.read) || a.name.localeCompare(b.name));
}

function safeParse(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}
