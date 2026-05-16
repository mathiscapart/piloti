"use client";

import { Droplets } from "lucide-react";
import { useActionState, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markAsDrying } from "@/modules/inventory/loan-actions";
import type { ActionResult } from "@/modules/inventory/actions";

const initialState: ActionResult = { error: null };

export function DryingDialog({ loanId }: { loanId: string }) {
  const [open, setOpen] = useState(false);
  const action = markAsDrying.bind(null, loanId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="info" size="sm">
          <Droplets className="size-4" />
          Séchage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mettre en séchage</DialogTitle>
          <DialogDescription>
            Indique où le matériel sèche pour qu&apos;on puisse le retrouver.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dryingLocation">Endroit</Label>
            <Input
              id="dryingLocation"
              name="dryingLocation"
              required
              placeholder="local Bleus / chez Marie Dupont"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dryingPersonName">
              Personne référente (optionnel)
            </Label>
            <Input
              id="dryingPersonName"
              name="dryingPersonName"
              placeholder="Marie Dupont"
            />
          </div>
          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
            >
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Mettre en séchage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
