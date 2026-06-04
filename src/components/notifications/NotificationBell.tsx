"use client";

import { Bell, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/notifications/actions";
import type {
  NotificationItem,
  NotificationSnapshot,
} from "@/modules/notifications/queries";

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export function NotificationBell({
  initial,
  compact,
  align = "right",
}: {
  initial: NotificationSnapshot;
  compact?: boolean;
  // Sens d'ouverture du panneau : "right" (ancré à droite, s'ouvre vers la
  // gauche — header mobile) ou "left" (s'ouvre vers la droite — sidebar desktop,
  // sinon le panneau sort de l'écran à gauche).
  align?: "left" | "right";
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await fetchNotifications());
    } catch {
      // ignore (réseau / déconnexion)
    }
  }, []);

  // Flux SSE : rafraîchit la cloche dès qu'une notification arrive.
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type?: string };
        if (data.type === "notification") void refresh();
      } catch {
        // ping / ready : ignore
      }
    };
    es.onerror = () => {
      // EventSource se reconnecte tout seul ; rien à faire.
    };
    return () => es.close();
  }, [refresh]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function onItemClick(item: NotificationItem) {
    setOpen(false);
    if (!item.read) {
      setSnapshot((s) => ({
        unread: Math.max(0, s.unread - 1),
        items: s.items.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
      }));
      await markNotificationRead(item.id);
    }
    if (item.link) router.push(item.link);
  }

  async function onMarkAll() {
    setSnapshot((s) => ({
      unread: 0,
      items: s.items.map((i) => ({ ...i, read: true })),
    }));
    await markAllNotificationsRead();
  }

  const { unread, items } = snapshot;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} non lues)` : ""}`}
        className={cn(
          "relative flex items-center justify-center rounded-full transition-colors hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "size-9" : "size-10",
        )}
      >
        <Bell className="size-5 text-earth" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-brick px-1 text-[10px] font-black leading-4 text-snow">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-stone/60 bg-snow shadow-card",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          <div className="flex items-center justify-between border-b border-stone/60 px-4 py-2.5">
            <p className="text-sm font-bold text-earth">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                className="flex items-center gap-1 text-xs font-bold text-forest hover:underline"
              >
                <Check className="size-3.5" />
                Tout lire
              </button>
            )}
          </div>

          <ul className="max-h-96 divide-y divide-stone/40 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-trail">
                Aucune notification.
              </li>
            ) : (
              items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(item)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-sand",
                      !item.read && "bg-sky-soft/40",
                    )}
                  >
                    {!item.read && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-sky" />
                    )}
                    <div className={cn("min-w-0 flex-1", item.read && "pl-5")}>
                      <p className="truncate text-sm font-bold text-earth">
                        {item.title}
                      </p>
                      <p className="line-clamp-2 text-sm text-trail">{item.body}</p>
                      <p className="mt-0.5 text-xs text-trail/70">
                        {timeAgo(item.createdAt)}
                      </p>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
