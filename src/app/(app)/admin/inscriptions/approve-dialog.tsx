"use client";

import { Check } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { approveUser } from "@/modules/admin/actions";

const emptyState = { error: null } as const;

interface Props {
  userId: string;
  fullName: string;
}

export function ApproveDialog({ userId, fullName }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await approveUser(emptyState, formData);
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        toast.success(`${fullName} validé.`);
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
        <Button size="sm">
          <Check className="size-4" />
          Valider
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Valider l&apos;inscription</DialogTitle>
          <DialogDescription>
            {fullName} pourra se connecter avec le rôle choisi.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1.5">
            <Label htmlFor={`role-${userId}`}>Rôle attribué</Label>
            <Select name="role" defaultValue="CHEF">
              <SelectTrigger id={`role-${userId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHEF">Chef</SelectItem>
                <SelectItem value="ADMIN">Administrateur</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-trail">
              Les rôles PARENT et SCOUT arriveront en V2.
            </p>
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
              {pending ? "Validation…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
