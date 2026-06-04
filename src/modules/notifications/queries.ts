import { db } from "@/lib/db";

// Données de la cloche : compteur non-lus + liste récente. Utilisé par le rendu
// initial (server component) et par le refetch (server action) sur événement SSE.

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  count: number;
  read: boolean;
  createdAt: Date;
}

export async function listNotifications(
  userId: string,
  take = 20,
): Promise<NotificationItem[]> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    count: n.count,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  }));
}

export interface NotificationSnapshot {
  unread: number;
  items: NotificationItem[];
}

export async function getNotificationSnapshot(
  userId: string,
): Promise<NotificationSnapshot> {
  const [unread, items] = await Promise.all([
    getUnreadCount(userId),
    listNotifications(userId),
  ]);
  return { unread, items };
}
