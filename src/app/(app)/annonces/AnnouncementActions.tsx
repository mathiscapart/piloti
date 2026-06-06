"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteAnnouncement } from "@/modules/communication/announcement-actions";

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
