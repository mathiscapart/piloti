"use client";

import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  fetchThread,
  markConversationRead,
  sendDirectMessage,
} from "@/modules/communication/dm-actions";
import type { Thread } from "@/modules/communication/dm-queries";

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function ThreadView({ initial }: { initial: Thread }) {
  const otherId = initial.otherId;
  const [messages, setMessages] = useState(initial.messages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const fresh = await fetchThread(otherId);
    if (fresh) setMessages(fresh.messages);
  }, [otherId]);

  // Marque lu au montage + reçoit les nouveaux messages en temps réel.
  useEffect(() => {
    void markConversationRead(otherId);
  }, [otherId]);

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type?: string };
        if (data.type === "dm") {
          void refresh().then(() => markConversationRead(otherId));
        }
      } catch {
        // ping / ready
      }
    };
    return () => es.close();
  }, [refresh, otherId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    setBody("");
    const res = await sendDirectMessage(otherId, text);
    if (res.error) {
      toast.error(res.error);
      setBody(text);
    } else {
      await refresh();
    }
    setSending(false);
  }

  // Accusé de lecture : sous le dernier message envoyé par moi, s'il est lu.
  const lastMineRead = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].mine) return messages[i].readAt !== null;
    }
    return false;
  })();

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-2xl flex-col md:h-dvh">
      <header className="flex items-center gap-2 border-b border-stone/60 bg-snow px-4 py-3">
        <Link href="/messages" className="text-trail hover:text-earth">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="truncate font-bold text-earth">{initial.otherName}</h1>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-trail">
            Démarre la conversation avec {initial.otherName}.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  m.mine
                    ? "rounded-br-sm bg-forest text-snow"
                    : "rounded-bl-sm bg-snow text-earth shadow-card",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={cn(
                    "mt-0.5 text-right text-[10px]",
                    m.mine ? "text-snow/70" : "text-trail",
                  )}
                >
                  {TIME_FMT.format(new Date(m.createdAt))}
                </p>
              </div>
            </div>
          ))
        )}
        {lastMineRead ? (
          <p className="pr-1 text-right text-[11px] font-medium text-trail">
            Lu
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 border-t border-stone/60 bg-snow p-3 pb-[calc(0.75rem+5rem+env(safe-area-inset-bottom))] md:pb-3"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Écrire un message…"
          className="max-h-32 min-h-10 flex-1 resize-none"
        />
        <button
          type="submit"
          disabled={sending || body.trim().length === 0}
          aria-label="Envoyer"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-forest text-snow transition-colors hover:bg-forest-ink disabled:opacity-40"
        >
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}
