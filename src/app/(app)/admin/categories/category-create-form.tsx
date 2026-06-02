"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory } from "@/modules/inventory/category-actions";
import type { CategoryRow } from "@/modules/inventory/queries";

const initialState = { error: null };

export function CategoryCreateForm({ roots }: { roots: CategoryRow[] }) {
  const [state, formAction, pending] = useActionState(createCategory, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="label">Nom</Label>
        <Input
          id="label"
          name="label"
          required
          placeholder="Couchage, Éclairage…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="parentSlug">Catégorie parente (optionnel)</Label>
        <select
          id="parentSlug"
          name="parentSlug"
          defaultValue=""
          className="flex h-9 w-full rounded-md border border-stone/40 bg-snow px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-forest"
        >
          <option value="">— Aucune (catégorie racine)</option>
          {roots.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-trail">
          Laisse vide pour une catégorie principale, ou choisis un parent pour
          créer une sous-catégorie.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="canDry" name="canDry" className="size-4 rounded" />
        <Label htmlFor="canDry" className="cursor-pointer">
          Peut être mis en séchage
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="requireWeighing"
          name="requireWeighing"
          className="size-4 rounded"
        />
        <Label htmlFor="requireWeighing" className="cursor-pointer">
          Doit être pesée au retour
        </Label>
      </div>
      {state.error ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        <Plus className="size-4" />
        {pending ? "Ajout…" : "Ajouter"}
      </Button>
    </form>
  );
}
