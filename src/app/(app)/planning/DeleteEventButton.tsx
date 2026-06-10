"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteEvent } from "@/modules/planning/actions";

// Supprime (annule) un événement après confirmation. La Server Action redirige
// vers /planning en cas de succès ; on ne gère ici que l'erreur éventuelle.
export function DeleteEventButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm("Supprimer cet événement ? Cette action est définitive.")) {
      return;
    }
    start(async () => {
      const res = await deleteEvent(eventId);
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onDelete}
      disabled={pending}
      className="text-brick hover:bg-brick-soft hover:text-brick-ink"
    >
      <Trash2 className="size-4" />
      {pending ? "Suppression…" : "Supprimer"}
    </Button>
  );
}
