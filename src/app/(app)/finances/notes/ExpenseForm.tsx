"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  RECEIPT_REQUIRED_ABOVE_CENTS,
  type ExpenseCategory,
} from "@/lib/enums";
import type { ActionResult } from "@/lib/types";
import { createExpense } from "@/modules/finance/actions";

const emptyState: ActionResult = { error: null };

export function ExpenseForm({
  events,
}: {
  events: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createExpense,
    emptyState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="amount">Montant (€)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            placeholder="60,50"
            className="w-full min-w-0"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="date">Date de la dépense</Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={today}
            className="w-full min-w-0 appearance-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="category">Catégorie</Label>
          <select
            id="category"
            name="category"
            defaultValue="NOURRITURE"
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c as ExpenseCategory]}
              </option>
            ))}
          </select>
        </div>
        {events.length > 0 ? (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="eventId">Événement (optionnel)</Label>
            <select
              id="eventId"
              name="eventId"
              defaultValue=""
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
            >
              <option value="">Aucun</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Description (optionnel)</Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          placeholder="Courses pour le week-end, péage…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="receipt">Photo du reçu</Label>
        <input
          id="receipt"
          type="file"
          name="receipt"
          accept="image/*"
          className="block w-full text-sm text-trail file:mr-3 file:rounded-full file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-earth hover:file:bg-sand/70"
        />
        <p className="text-xs text-trail">
          Obligatoire au-dessus de {RECEIPT_REQUIRED_ABOVE_CENTS / 100} €.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Envoi…" : "Déclarer la note"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
