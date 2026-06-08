"use client";

import { BellRing, Check, Eye, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  deleteAnnouncement,
  fetchAnnouncementReaders,
  markAnnouncementsRead,
  remindUnreadAnnouncement,
} from "@/modules/communication/announcement-actions";
import type { ReaderEntry } from "@/modules/communication/announcement-queries";

// US-C03 — marque les annonces affichées comme lues, une seule fois au montage.
export function MarkAnnouncementsRead({ ids }: { ids: string[] }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || ids.length === 0) return;
    done.current = true;
    void markAnnouncementsRead(ids);
  }, [ids]);
  return null;
}

// US-C03 — taux de lecture + détail lecteurs/non-lecteurs + relance (auteur/admin).
export function ReadStatsButton({
  id,
  read,
  total,
}: {
  id: string;
  read: number;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [readers, setReaders] = useState<ReaderEntry[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open && readers === null) {
      fetchAnnouncementReaders(id).then(setReaders).catch(() => setReaders([]));
    }
  }, [open, id, readers]);

  const unreadCount = readers
    ? readers.filter((r) => !r.read).length
    : Math.max(0, total - read);

  function onRemind() {
    start(async () => {
      const res = await remindUnreadAnnouncement(id);
      if (res.error) toast.error(res.error);
      else toast.success(`Relance envoyée à ${res.reminded ?? 0} personne(s).`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-xs font-bold text-trail transition-colors hover:bg-stone"
          title="Statistiques de lecture"
        >
          <Eye className="size-3.5" />
          {read}/{total} lu
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Lecture · {read}/{total}</DialogTitle>
        </DialogHeader>

        {readers === null ? (
          <p className="py-6 text-center text-sm text-trail">Chargement…</p>
        ) : readers.length === 0 ? (
          <p className="py-6 text-center text-sm text-trail">Aucun destinataire.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {readers.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
              >
                <span className="truncate text-earth">{r.name}</span>
                {r.read ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-forest">
                    <Check className="size-3.5" /> Lu
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-trail">
                    <X className="size-3.5" /> Pas lu
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={onRemind}
            disabled={pending}
            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-forest px-4 py-2 text-sm font-bold text-snow transition-colors hover:bg-forest-ink disabled:opacity-50"
          >
            <BellRing className="size-4" />
            {pending ? "Envoi…" : `Relancer les non-lecteurs (${unreadCount})`}
          </button>
        ) : (
          <p className="mt-2 text-center text-xs font-bold text-forest">
            Tout le monde a lu 🎉
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAnnouncementButton({ id }: { id: string }) {
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm("Supprimer cette annonce ?")) return;
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteAnnouncement({ error: null }, fd);
      if (res.error) toast.error(res.error);
      else toast.success("Annonce supprimée.");
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      aria-label="Supprimer l'annonce"
      className="rounded-full p-2 text-trail transition-colors hover:bg-brick-soft hover:text-brick disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
