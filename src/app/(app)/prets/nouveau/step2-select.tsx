"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { CategoryIcon } from "@/components/equipment/CategoryChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createLoan } from "@/modules/inventory/loan-actions";
import type { ActionResult } from "@/lib/types";
import type { BorrowableEquipment } from "@/modules/inventory/queries";

const initialState: ActionResult = { error: null };

interface Details {
  borrowerId: string;
  startDate: string;
  expectedReturn: string;
  eventName: string;
}

interface Props {
  equipment: BorrowableEquipment[];
  preselected: string[];
  initialSearch: string;
  details: Details;
  borrowerLabel: string;
}

export function Step2Select({
  equipment,
  preselected,
  initialSearch,
  details,
  borrowerLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(createLoan, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Champs cachés qui propagent l'emprunteur + les dates à l'étape de recherche
  // et à la création.
  const detailFields = (
    <>
      <input type="hidden" name="borrowerId" value={details.borrowerId} />
      <input type="hidden" name="startDate" value={details.startDate} />
      <input type="hidden" name="expectedReturn" value={details.expectedReturn} />
      <input type="hidden" name="eventName" value={details.eventName} />
    </>
  );

  return (
    <div className="space-y-4">
      {/* Récap de l'étape 1 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sand p-3 text-xs text-trail">
        <span>
          Pour <strong className="text-earth">{borrowerLabel}</strong> ·{" "}
          {details.startDate} → {details.expectedReturn}
          {details.eventName ? ` · ${details.eventName}` : ""}
        </span>
        <Link
          href={`/prets/nouveau?borrowerId=${encodeURIComponent(details.borrowerId)}&startDate=${details.startDate}&expectedReturn=${details.expectedReturn}&eventName=${encodeURIComponent(details.eventName)}`}
          className="font-bold text-trail hover:text-earth"
        >
          Modifier
        </Link>
      </div>

      {/* Recherche (formulaire GET dédié, préserve emprunteur/dates/sélection) */}
      <form method="GET" action="/prets/nouveau" role="search">
        <input type="hidden" name="step" value="2" />
        {detailFields}
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="equipmentId" value={id} />
        ))}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-trail" />
          <Input
            type="search"
            name="q"
            defaultValue={initialSearch}
            placeholder="Chercher un article (nom ou catégorie)…"
            className="pl-9"
          />
          <p className="mt-1 text-xs text-trail">
            Tape Entrée pour filtrer la liste.
          </p>
        </div>
      </form>

      {/* Sélection + détails par article → création du prêt groupé */}
      <form action={formAction} className="space-y-4">
        {detailFields}

        <ul className="space-y-2">
          {equipment.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-stone p-6 text-center text-sm text-trail">
              Aucun article ne correspond.
            </li>
          ) : (
            equipment.map((eq) => {
              const isSelected = selected.has(eq.id);
              return (
                <li key={eq.id} className="space-y-2">
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl bg-snow p-3 shadow-card transition-opacity",
                      eq.disabled && "cursor-not-allowed opacity-50",
                      isSelected && !eq.disabled && "ring-2 ring-forest",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="equipmentId"
                      value={eq.id}
                      disabled={eq.disabled}
                      checked={isSelected && !eq.disabled}
                      onChange={() => toggle(eq.id)}
                      className="size-5 accent-forest"
                    />
                    <div className="flex aspect-square size-12 shrink-0 items-center justify-center rounded-xl bg-sand">
                      <CategoryIcon
                        category={eq.category}
                        className="size-6 text-trail"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-earth">{eq.name}</p>
                      <p className="text-xs text-trail">
                        {eq.availableQty} / {eq.totalQty} disponible
                        {eq.totalQty > 1 ? "s" : ""} sur la période
                        {eq.location ? ` · ${eq.location}` : ""}
                      </p>
                    </div>
                    {eq.disabled ? (
                      <span className="rounded-full bg-stone px-2.5 py-0.5 text-xs font-bold text-earth">
                        {eq.disabledReason}
                      </span>
                    ) : null}
                  </label>

                  {/* US-30/US-32 — pour un article coché : quantité + date de
                      retour propre (défaut = date commune). */}
                  {isSelected && !eq.disabled ? (
                    <div className="ml-8 flex flex-wrap items-end gap-3 rounded-xl bg-sand p-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`qty__${eq.id}`}
                          className="text-xs text-trail"
                        >
                          Quantité
                        </Label>
                        <Input
                          id={`qty__${eq.id}`}
                          name={`qty__${eq.id}`}
                          type="number"
                          min={1}
                          max={Math.max(1, eq.availableQty)}
                          defaultValue={1}
                          required
                          className="w-24"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`return__${eq.id}`}
                          className="text-xs text-trail"
                        >
                          Retour prévu
                        </Label>
                        <Input
                          id={`return__${eq.id}`}
                          name={`return__${eq.id}`}
                          type="date"
                          defaultValue={details.expectedReturn}
                          className="w-44"
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>

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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-sm text-trail">
            {selected.size} article{selected.size > 1 ? "s" : ""} sélectionné
            {selected.size > 1 ? "s" : ""}
          </span>
          <Button type="submit" disabled={pending || selected.size === 0}>
            {pending ? "Création…" : "Créer le prêt"}
          </Button>
        </div>
      </form>
    </div>
  );
}
