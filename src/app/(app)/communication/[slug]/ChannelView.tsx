"use client";

import { ImagePlus, Pin, Send, SmilePlus } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  editMessage,
  loadMessages,
  markChannelRead,
  postMessage,
  togglePin,
  toggleReaction,
} from "@/modules/communication/actions";
import type { ActionResult } from "@/lib/types";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "✅"];

interface Reaction {
  emoji: string;
  userId: string;
}
interface Msg {
  id: string;
  body: string;
  attachments: string;
  createdAt: string | Date;
  editedAt: string | Date | null;
  pinnedAt: string | Date | null;
  author: { id: string; firstName: string; lastName: string };
  reactions: Reaction[];
}

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function ChannelView({
  channelId,
  initialMessages,
  currentUserId,
  isStaff,
  canWrite,
}: {
  channelId: string;
  initialMessages: Msg[];
  currentUserId: string;
  isStaff: boolean;
  canWrite: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const action = postMessage.bind(null, channelId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    action,
    { error: null },
  );

  const refetch = useCallback(async () => {
    const fresh = await loadMessages(channelId);
    if (fresh) setMessages(fresh as unknown as Msg[]);
  }, [channelId]);

  // SSE : refetch sur tout événement du salon.
  useEffect(() => {
    const es = new EventSource(`/api/channels/${channelId}/stream`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type && ev.type !== "ready") refetch();
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, [channelId, refetch]);

  // Marque lu au montage + à chaque nouveau message.
  useEffect(() => {
    void markChannelRead(channelId);
  }, [channelId, messages.length]);

  // Défile en bas à l'arrivée de messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) setAttachments((a) => [...a, json.url]);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const pinned = messages.filter((m) => m.pinnedAt);

  return (
    <div className="flex h-full flex-col">
      {pinned.length > 0 ? (
        <div className="border-b border-stone/60 bg-sun-soft/40 px-4 py-2 text-xs text-sun-ink">
          <span className="font-bold">📌 Épinglé :</span>{" "}
          {pinned[pinned.length - 1].body.slice(0, 120)}
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-trail">
            Aucun message. Lance la discussion !
          </p>
        ) : (
          messages.map((m) => (
            <MessageRow
              key={m.id}
              msg={m}
              mine={m.author.id === currentUserId}
              currentUserId={currentUserId}
              isStaff={isStaff}
              onChanged={refetch}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {canWrite ? (
        <form
          ref={formRef}
          action={(fd) => {
            // fd est déjà construit (body + attachments cachés) ; on dispatch
            // puis on vide le composer hors effet (pas de cascade de renders).
            formAction(fd);
            setAttachments([]);
            formRef.current?.reset();
          }}
          className="border-t border-stone/60 bg-snow p-3"
        >
          {attachments.map((url) => (
            <input key={url} type="hidden" name="attachments" value={url} />
          ))}
          {attachments.length > 0 ? (
            <div className="mb-2 flex gap-2">
              {attachments.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="size-14 rounded-lg object-cover"
                />
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-sand text-trail hover:bg-stone">
              <ImagePlus className="size-5" />
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
            <Textarea
              name="body"
              rows={1}
              placeholder={uploading ? "Envoi de l'image…" : "Écrire un message…"}
              className="min-h-10 flex-1 resize-none"
            />
            <Button type="submit" disabled={pending} className="shrink-0">
              <Send className="size-4" />
            </Button>
          </div>
          {state.error ? (
            <p className="mt-1 text-xs font-medium text-brick">{state.error}</p>
          ) : null}
        </form>
      ) : (
        <p className="border-t border-stone/60 bg-sand p-3 text-center text-xs text-trail">
          Lecture seule.
        </p>
      )}
    </div>
  );
}

function MessageRow({
  msg,
  mine,
  currentUserId,
  isStaff,
  onChanged,
}: {
  msg: Msg;
  mine: boolean;
  currentUserId: string;
  isStaff: boolean;
  onChanged: () => void;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const attachments: string[] = (() => {
    try {
      const p = JSON.parse(msg.attachments);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  })();

  // Regroupe les réactions par emoji.
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of msg.reactions) {
    const g = grouped.get(r.emoji) ?? { count: 0, mine: false };
    g.count += 1;
    if (r.userId === currentUserId) g.mine = true;
    grouped.set(r.emoji, g);
  }

  async function react(emoji: string) {
    setShowEmoji(false);
    await toggleReaction(msg.id, emoji);
    onChanged();
  }
  async function handleEdit() {
    const next = window.prompt("Modifier le message :", msg.body);
    if (next === null) return;
    await editMessage(msg.id, next);
    onChanged();
  }
  async function handlePin() {
    await togglePin(msg.id);
    onChanged();
  }

  return (
    <div className="group rounded-xl px-2 py-1 hover:bg-sand/50">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-earth">
          {msg.author.firstName} {msg.author.lastName}
        </span>
        <time className="text-[11px] text-trail">
          {TIME_FMT.format(new Date(msg.createdAt))}
          {msg.editedAt ? " · modifié" : ""}
          {msg.pinnedAt ? " · 📌" : ""}
        </time>
        <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="rounded p-1 text-trail hover:bg-stone"
            title="Réagir"
          >
            <SmilePlus className="size-4" />
          </button>
          {isStaff ? (
            <button
              type="button"
              onClick={handlePin}
              className="rounded p-1 text-trail hover:bg-stone"
              title={msg.pinnedAt ? "Désépingler" : "Épingler"}
            >
              <Pin className="size-4" />
            </button>
          ) : null}
          {mine ? (
            <button
              type="button"
              onClick={handleEdit}
              className="rounded px-1 text-xs text-trail hover:bg-stone"
            >
              Éditer
            </button>
          ) : null}
        </span>
      </div>

      {msg.body ? (
        <p className="whitespace-pre-wrap break-words text-sm text-earth">
          {msg.body}
        </p>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {attachments.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt="pièce jointe"
              className="max-h-48 rounded-lg object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {[...grouped.entries()].map(([emoji, g]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs",
              g.mine
                ? "border-forest bg-forest-soft text-forest-ink"
                : "border-stone bg-snow text-earth hover:bg-sand",
            )}
          >
            {emoji} {g.count}
          </button>
        ))}
        {showEmoji ? (
          <span className="flex gap-1 rounded-full bg-snow px-1 shadow-card">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => react(e)}
                className="rounded px-1 hover:bg-sand"
              >
                {e}
              </button>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
