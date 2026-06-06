import { db } from "@/lib/db";
import { can, effectiveRoles } from "@/lib/permissions";

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
}

// US-C01 — annonces visibles par l'utilisateur. Un encadrant (publish) ou ADMIN
// voit tout (gestion) ; sinon visibilité selon l'audience.
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

  return rows
    .filter((a) => visible(a.audience))
    .map((a) => ({
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
    }));
}

function safeParse(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}
