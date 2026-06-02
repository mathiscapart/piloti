"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CategoryIcon } from "@/components/equipment/CategoryChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BorrowableEquipment } from "@/modules/inventory/queries";

interface Props {
  equipment: BorrowableEquipment[];
  preselected: string[];
  initialSearch: string;
}

export function Step1Select({ equipment, preselected, initialSearch }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(preselected),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* US-20 — Recherche dans SON PROPRE formulaire GET. Auparavant le champ
          partageait le formulaire de sélection (avec `step=2` caché) : taper
          Entrée soumettait l'étape 2 sans sélection → redirect vers l'étape 1
          en perdant le `q`, donc la recherche semblait ne rien faire. On
          préserve la sélection courante via des `equipmentId` cachés. */}
      <form method="GET" action="/prets/nouveau" role="search">
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

      <form method="GET" action="/prets/nouveau" className="space-y-4">
        {/* Indique au server qu'on passe à l'étape 2 */}
        <input type="hidden" name="step" value="2" />

        <ul className="space-y-2">
        {equipment.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-stone p-6 text-center text-sm text-trail">
            Aucun article ne correspond.
          </li>
        ) : (
          equipment.map((eq) => {
            const isSelected = selected.has(eq.id);
            return (
              <li key={eq.id}>
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
                      {eq.totalQty > 1 ? "s" : ""}
                      {eq.location ? ` · ${eq.location}` : ""}
                    </p>
                  </div>
                  {eq.disabled ? (
                    <span className="rounded-full bg-stone px-2.5 py-0.5 text-xs font-bold text-earth">
                      {eq.disabledReason}
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Link
          href="/prets"
          className="text-sm font-bold text-trail hover:text-earth"
        >
          Annuler
        </Link>
        <Button type="submit" disabled={selected.size === 0}>
          Continuer →
          {selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
        </div>
      </form>
    </div>
  );
}
