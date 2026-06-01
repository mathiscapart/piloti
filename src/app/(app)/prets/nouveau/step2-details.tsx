"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createLoan } from "@/modules/inventory/loan-actions";
import type { ActionResult } from "@/lib/types";
import type {
  BorrowableEquipment,
  BorrowerOption,
} from "@/modules/inventory/queries";

const initialState: ActionResult = { error: null };

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface Props {
  selectedEquipment: BorrowableEquipment[];
  borrowers: BorrowerOption[];
}

export function Step2Details({ selectedEquipment, borrowers }: Props) {
  const [state, formAction, pending] = useActionState(
    createLoan,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5 rounded-2xl bg-snow p-6 shadow-card">
      {/* US-30 — chaque article porte une quantité (≤ disponible). Le champ
          equipmentId est conservé ici et apparié à qty__<id>. */}
      <div className="rounded-xl bg-sand p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          Matériel sélectionné ({selectedEquipment.length})
        </p>
        <ul className="mt-2 space-y-2">
          {selectedEquipment.map((eq) => (
            <li
              key={eq.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-snow px-3 py-2"
            >
              <input type="hidden" name="equipmentId" value={eq.id} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-earth">{eq.name}</p>
                <p className="text-xs text-trail">
                  {eq.availableQty} disponible{eq.availableQty > 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Label htmlFor={`qty__${eq.id}`} className="text-xs text-trail">
                  Qté
                </Label>
                <Input
                  id={`qty__${eq.id}`}
                  name={`qty__${eq.id}`}
                  type="number"
                  min={1}
                  max={Math.max(1, eq.availableQty)}
                  defaultValue={1}
                  required
                  className="w-20"
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="borrowerId">Emprunteur</Label>
        <Select name="borrowerId" required>
          <SelectTrigger id="borrowerId">
            <SelectValue placeholder="Choisir un membre…" />
          </SelectTrigger>
          <SelectContent>
            {borrowers.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.firstName} {b.lastName}
                {b.unit ? ` · ${b.unit}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="startDate">Date de départ</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={today()}
            className="w-full"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expectedReturn">Date de retour prévue</Label>
          <Input
            id="expectedReturn"
            name="expectedReturn"
            type="date"
            required
            defaultValue={inDays(7)}
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="eventName">Événement (optionnel)</Label>
        <Input
          id="eventName"
          name="eventName"
          placeholder="Week-end Pios 9/10, Réunion Bleus…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optionnel)</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/prets/nouveau"
          className="text-sm font-bold text-trail hover:text-earth"
        >
          ← Modifier la sélection
        </Link>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Création…"
            : `Créer ${selectedEquipment.length > 1 ? `les ${selectedEquipment.length} prêts` : "le prêt"}`}
        </Button>
      </div>
    </form>
  );
}
