"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EQUIPMENT_CONDITIONS } from "@/lib/enums";
import { CONDITION_LABEL } from "@/modules/inventory/types";
import type { CategoryRow } from "@/modules/inventory/queries";
import type { ActionResult } from "@/lib/types";

interface InitialValues {
  name?: string;
  category?: string;
  totalQty?: number;
  condition?: string;
  location?: string | null;
  photo?: string | null;
  notes?: string | null;
}

interface EquipmentFormProps {
  action: (
    state: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
  categories: CategoryRow[];
  initial?: InitialValues;
  submitLabel: string;
  pendingLabel: string;
}

const initialState: ActionResult = { error: null };

export function EquipmentForm({
  action,
  categories,
  initial,
  submitLabel,
  pendingLabel,
}: EquipmentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  // US-24 — regroupe les catégories par parent pour un select hiérarchique.
  // « Autre » (réceptacle par défaut) est toujours affichée en dernier.
  const roots = categories
    .filter((c) => !c.parentSlug)
    .sort((a, b) => (a.slug === "AUTRE" ? 1 : 0) - (b.slug === "AUTRE" ? 1 : 0));
  const childrenOf = (slug: string) =>
    categories.filter((c) => c.parentSlug === slug);

  return (
    <form action={formAction} className="space-y-5 rounded-2xl bg-snow p-6 shadow-card">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nom de l&apos;article</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          placeholder="Tente Canadienne 4p #3"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Catégorie</Label>
          <Select name="category" defaultValue={initial?.category ?? roots[0]?.slug ?? ""}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roots.map((root) => {
                const subs = childrenOf(root.slug);
                if (subs.length === 0) {
                  return (
                    <SelectItem key={root.slug} value={root.slug}>
                      {root.label}
                    </SelectItem>
                  );
                }
                return (
                  <SelectGroup key={root.slug}>
                    <SelectLabel>{root.label}</SelectLabel>
                    {/* Le parent reste sélectionnable (article classé au niveau parent) */}
                    <SelectItem value={root.slug}>{root.label} — général</SelectItem>
                    {subs.map((sub) => (
                      <SelectItem key={sub.slug} value={sub.slug} className="pl-8">
                        {sub.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="condition">État</Label>
          <Select name="condition" defaultValue={initial?.condition ?? "BON"}>
            <SelectTrigger id="condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT_CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="totalQty">Quantité totale</Label>
          <Input
            id="totalQty"
            name="totalQty"
            type="number"
            min={1}
            required
            defaultValue={initial?.totalQty ?? 1}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="location">Localisation (optionnel)</Label>
          <Input
            id="location"
            name="location"
            defaultValue={initial?.location ?? ""}
            placeholder="Local Bleus"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="photo">URL photo (optionnel)</Label>
        <Input
          id="photo"
          name="photo"
          type="url"
          defaultValue={initial?.photo ?? ""}
          placeholder="https://…"
        />
        <p className="text-xs text-trail">
          L&apos;upload de fichiers est branché en Phase 7 (incidents). Pour
          l&apos;instant, colle une URL.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optionnel)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial?.notes ?? ""}
          placeholder="Achat 2024, peu utilisée…"
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
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
