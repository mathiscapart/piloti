"use client";

import { X } from "lucide-react";
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
import { rejectUser } from "@/modules/admin/actions";

const emptyState = { error: null } as const;

interface Props {
  userId: string;
  fullName: string;
}

export function RejectDialog({ userId, fullName }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await rejectUser(emptyState, formData);
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        toast.success(`${fullName} refusé.`);
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
          <X className="size-4" />
          Refuser
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refuser l&apos;inscription</DialogTitle>
          <DialogDescription>
            La raison sera affichée à {fullName} s&apos;il tente de se
            connecter.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${userId}`}>
              Raison du refus (obligatoire)
            </Label>
            <Textarea
              id={`reason-${userId}`}
              name="reason"
              rows={3}
              required
              placeholder="Compte non identifié dans le groupe, doublon, etc."
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
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Refus…" : "Confirmer le refus"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
