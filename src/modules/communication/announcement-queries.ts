import { db } from "@/lib/db";
import { can, effectiveRoles } from "@/lib/permissions";

import { audienceUserIds, type AudienceUser, type FamilyEdge } from "./audience";

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

// Comptes actifs + rattachements familiaux : entrée de `audienceUserIds`.
export async function loadAudienceContext(): Promise<{
  users: AudienceUser[];
  links: FamilyEdge[];
}> {
  const [users, links] = await Promise.all([
    db.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, role: true, roles: true, unit: true },
    }),
    db.familyLink.findMany({ select: { parentId: true, childId: true } }),
  ]);
  return { users, links };
}

// L'utilisateur fait-il partie de l'audience ? Un parent l'est pour la branche
// de ses enfants (#111) — on ne charge que ses propres enfants actifs.
export async function viewerAudienceFilter(
  user: ViewerUser,
): Promise<(audience: string) => boolean> {
  const links = await db.familyLink.findMany({
    where: { parentId: user.id, child: { status: "ACTIVE" } },
    select: {
      parentId: true,
      childId: true,
      child: { select: { id: true, role: true, roles: true, unit: true } },
    },
  });
  const users: AudienceUser[] = [
    { id: user.id, role: user.role, roles: user.roles ?? null, unit: user.unit ?? null },
    ...links.map((l) => l.child),
  ];
  return (audience) => audienceUserIds(users, links, audience).includes(user.id);
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

  const inAudience =
    isStaff || isAdmin ? () => true : await viewerAudienceFilter(user);

  const items = rows.filter((a) => inAudience(a.audience));
  const managed = items.filter((a) => isAdmin || a.authorId === user.id);

  // Stats de lecture (US-C03) — calculées seulement s'il y a des annonces
  // gérées. Seuls les lecteurs de l'audience comptent (#111).
  const statsById = new Map<string, { read: number; total: number }>();
  if (managed.length > 0) {
    const [{ users, links }, reads] = await Promise.all([
      loadAudienceContext(),
      db.announcementRead.findMany({
        where: { announcementId: { in: managed.map((a) => a.id) } },
        select: { announcementId: true, userId: true },
      }),
    ]);
    for (const a of managed) {
      const audience = new Set(audienceUserIds(users, links, a.audience, a.authorId));
      const read = reads.filter(
        (r) => r.announcementId === a.id && audience.has(r.userId),
      ).length;
      statsById.set(a.id, { read, total: audience.size });
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

  const [{ users, links }, reads] = await Promise.all([
    loadAudienceContext(),
    db.announcementRead.findMany({
      where: { announcementId },
      select: { userId: true },
    }),
  ]);
  const readers = new Set(reads.map((r) => r.userId));
  const audienceIds = audienceUserIds(
    users,
    links,
    announcement.audience,
    announcement.authorId,
  );
  const members = await db.user.findMany({
    where: { id: { in: audienceIds } },
    select: { id: true, firstName: true, lastName: true },
  });

  return members
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
