"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

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

// US-20 — normalisation insensible à la casse ET aux accents (idem recherche
// serveur), pour un filtrage instantané côté client.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

interface Details {
  borrowerId: string;
  startDate: string;
  expectedReturn: string;
  eventName: string;
}

interface Props {
  equipment: BorrowableEquipment[];
  categoryLabels: Record<string, string>;
  preselected: string[];
  initialSearch: string;
  details: Details;
  borrowerLabel: string;
}

export function Step2Select({
  equipment,
  categoryLabels,
  preselected,
  initialSearch,
  details,
  borrowerLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(createLoan, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));
  const [query, setQuery] = useState(initialSearch);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // US-20 — recherche instantanée par nom ET catégorie (slug + libellé),
  // insensible à la casse/accents. Aucun rechargement → sélection préservée.
  const term = normalize(query);
  const filtered = useMemo(() => {
    if (term.length === 0) return equipment;
    // Les articles déjà cochés restent visibles (leurs champs qté/date doivent
    // rester dans le formulaire pour être soumis), même s'ils ne matchent pas.
    return equipment.filter(
      (eq) =>
        selected.has(eq.id) ||
        normalize(
          `${eq.name} ${eq.category} ${categoryLabels[eq.category] ?? ""}`,
        ).includes(term),
    );
  }, [equipment, categoryLabels, term, selected]);

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

      {/* US-20 — recherche instantanée (filtrage client, sans rechargement) */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-trail" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un article (nom ou catégorie)…"
          className="pl-9"
          aria-label="Rechercher un article"
        />
      </div>

      {/* Sélection + détails par article → création du prêt groupé */}
      <form action={formAction} className="space-y-4">
        {detailFields}

        <ul className="space-y-2">
          {filtered.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-stone p-6 text-center text-sm text-trail">
              Aucun article ne correspond.
            </li>
          ) : (
            filtered.map((eq) => {
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

        {/* US-16 — demande d'aide week-end : publie un sondage dans #général */}
        <label className="flex items-start gap-2 rounded-xl bg-sand p-3">
          <input
            type="checkbox"
            name="requestHelp"
            className="mt-0.5 size-4 accent-forest"
          />
          <span className="text-sm text-earth">
            Lancer une demande d&apos;aide dans le canal général
            <span className="block text-xs text-trail">
              Publie un sondage « Qui peut aider ce week-end ? » (amener /
              ramener le matériel, renfort humain).
            </span>
          </span>
        </label>

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
