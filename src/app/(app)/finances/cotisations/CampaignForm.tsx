"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNITS, UNIT_LABEL, type Unit } from "@/lib/enums";
import type { ActionResult } from "@/lib/types";
import { createCampaign } from "@/modules/finance/campaign-actions";

const emptyState: ActionResult = { error: null };

export function CampaignForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createCampaign,
    emptyState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nom de la campagne</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          placeholder="Cotisation 2026-2027"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="amount">Montant par jeune (€)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            placeholder="120"
            className="w-full min-w-0"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="unit">Périmètre</Label>
          <select
            id="unit"
            name="unit"
            defaultValue=""
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            <option value="">Tout le groupe</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u as Unit]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="deadline">Date limite (optionnel)</Label>
          <Input
            id="deadline"
            name="deadline"
            type="date"
            className="w-full min-w-0 appearance-none"
          />
        </div>
      </div>
      {/* Tarifs différenciés masqués — décision groupe, cf. DECISIONS.md D-022
          (le mécanisme « 2e enfant » / « cas social » reste actif en coulisse
          si déjà configuré, mais n'est plus saisissable depuis l'UI). */}
      <div className="max-w-40 space-y-1.5">
        <Label htmlFor="installments">Paiement en (fois)</Label>
        <Input
          id="installments"
          name="installments"
          type="number"
          min={1}
          max={12}
          defaultValue={1}
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Lancement…" : "Lancer la campagne"}
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
