"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolveIncident } from "@/modules/inventory/incident-actions";

const emptyState = { error: null } as const;

export function ResolveDialog({ incidentId }: { incidentId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await resolveIncident(incidentId, emptyState, formData);
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        toast.success("Incident résolu.");
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CheckCircle2 className="size-4" />
          Résoudre
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marquer comme résolu</DialogTitle>
          <DialogDescription>
            Ajoute une note de clôture (optionnel). L&apos;incident sera
            archivé dans l&apos;historique de l&apos;article.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="resolvedNote">Note de résolution</Label>
            <Textarea
              id="resolvedNote"
              name="resolvedNote"
              rows={3}
              placeholder="Réparé, vérifié, RAS…"
            />
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Résolution…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
