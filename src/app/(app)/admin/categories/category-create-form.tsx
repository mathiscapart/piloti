"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory } from "@/modules/inventory/category-actions";

const initialState = { error: null };

export function CategoryCreateForm() {
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
      <div className="flex items-center gap-2">
        <input type="checkbox" id="canDry" name="canDry" className="size-4 rounded" />
        <Label htmlFor="canDry" className="cursor-pointer">
          Peut être mis en séchage
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
