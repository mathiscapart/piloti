"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { returnLoan } from "@/modules/inventory/loan-actions";
import type { ActionResult } from "@/lib/types";
import {
  RETURN_CONDITIONS,
  RETURN_CONDITION_LABEL,
  type ReturnCondition,
} from "@/modules/inventory/types";

const initialState: ActionResult = { error: null };

const TONE: Record<ReturnCondition, string> = {
  BON: "border-forest bg-forest-soft text-forest-ink",
  ABIME: "border-fire bg-fire-soft text-fire-ink",
  A_REPARER: "border-brick bg-brick-soft text-brick-ink",
};

export function ReturnForm({
  loanId,
  quantity,
  requireWeighing = false,
}: {
  loanId: string;
  quantity: number;
  requireWeighing?: boolean;
}) {
  const action = returnLoan.bind(null, loanId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [selected, setSelected] = useState<ReturnCondition>("BON");

  return (
    <form action={formAction} className="space-y-5 rounded-2xl bg-snow p-6 shadow-card">
      {/* US-30 — quantité rendue (retours partiels). Masqué si 1 seul exemplaire. */}
      {quantity > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="returnedQuantity">Quantité rendue</Label>
          <Input
            id="returnedQuantity"
            name="returnedQuantity"
            type="number"
            min={1}
            max={quantity}
            defaultValue={quantity}
            className="w-28"
          />
          <p className="text-xs text-trail">
            {quantity} en cours. Rends-en moins pour un retour partiel (le reste
            demeure prêté).
          </p>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>État du matériel au retour</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RETURN_CONDITIONS.map((c) => (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-2xl border-2 p-3 text-sm font-bold transition-colors",
                selected === c
                  ? TONE[c]
                  : "border-stone bg-snow text-earth hover:bg-sand",
              )}
            >
              <input
                type="radio"
                name="condition"
                value={c}
                checked={selected === c}
                onChange={() => setSelected(c)}
                className="sr-only"
              />
              {RETURN_CONDITION_LABEL[c]}
            </label>
          ))}
        </div>
        {selected !== "BON" ? (
          <p className="rounded-md border border-fire/30 bg-fire-soft/40 px-3 py-2 text-xs font-medium text-fire-ink">
            Tu seras redirigé(e) vers le formulaire de signalement d&apos;incident
            après validation pour décrire le problème.
          </p>
        ) : null}
      </div>

      {/* US-17 — pesée obligatoire au retour si la catégorie l'exige */}
      {requireWeighing ? (
        <div className="space-y-1.5">
          <Label htmlFor="returnWeightKg">Poids au retour (kg)</Label>
          <Input
            id="returnWeightKg"
            name="returnWeightKg"
            type="number"
            step="0.01"
            min={0}
            required
            placeholder="Ex. 4.2"
            className="w-32"
          />
          <p className="text-xs text-trail">
            Cette catégorie impose de peser le matériel au retour.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Note (optionnel)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Détails sur l'état, remarques pour le suivi…"
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

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Validation…" : "Valider le retour"}
        </Button>
      </div>
    </form>
  );
}
