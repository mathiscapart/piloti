"use client";

import { MessageCircle, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROLE_LABEL, type Role } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { fetchConversations } from "@/modules/communication/dm-actions";
import type {
  ContactOption,
  ConversationSummary,
} from "@/modules/communication/dm-queries";

import { MessagingTabs } from "../communication/MessagingTabs";

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest font-bold text-snow">
      {initials}
    </div>
  );
}

export function ConversationList({
  initial,
  contacts,
}: {
  initial: ConversationSummary[];
  contacts: ContactOption[];
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type?: string };
        if (data.type === "dm") void refresh();
      } catch {
        // ping / ready
      }
    };
    return () => es.close();
  }, [refresh]);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-black text-earth md:text-4xl">Messagerie</h1>
          <NewMessageDialog contacts={contacts} onPick={(id) => router.push(`/messages/${id}`)} />
        </div>
        <MessagingTabs active="prives" />
      </header>

      {conversations.length === 0 ? (
        <div className="rounded-2xl bg-snow p-8 text-center shadow-card">
          <MessageCircle className="mx-auto size-10 text-stone" />
          <p className="mt-3 font-bold text-earth">Aucune conversation</p>
          <p className="text-sm text-trail">
            Démarre une conversation privée avec « Nouveau ».
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-snow shadow-card">
          {conversations.map((c) => (
            <li key={c.otherId} className="border-b border-stone/40 last:border-0">
              <button
                type="button"
                onClick={() => router.push(`/messages/${c.otherId}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sand"
              >
                <Avatar name={c.otherName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-bold text-earth">
                      {c.otherName}
                    </span>
                    <span className="shrink-0 text-xs text-trail">
                      {timeAgo(c.lastAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "truncate text-sm",
                      c.unread > 0 ? "font-bold text-earth" : "text-trail",
                    )}
                  >
                    {c.lastFromMe ? "Vous : " : ""}
                    {c.lastBody}
                  </p>
                </div>
                {c.unread > 0 ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brick text-[11px] font-black text-snow">
                    {c.unread > 9 ? "9+" : c.unread}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewMessageDialog({
  contacts,
  onPick,
}: {
  contacts: ContactOption[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(t));
  }, [q, contacts]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-forest px-4 py-2 text-sm font-bold text-snow transition-colors hover:bg-forest-ink"
        >
          <Plus className="size-4" />
          Nouveau
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nouveau message</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-trail" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un membre…"
            className="pl-9"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="py-6 text-center text-sm text-trail">Aucun membre.</li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(c.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sand"
                >
                  <Avatar name={c.name} />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-earth">{c.name}</p>
                    <p className="text-xs text-trail">
                      {ROLE_LABEL[c.role as Role] ?? c.role}
                    </p>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
