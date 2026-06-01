"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { setCategoryParent } from "@/modules/inventory/category-actions";

interface ParentOption {
  slug: string;
  label: string;
}

export function CategoryParentSelect({
  slug,
  parentSlug,
  options,
}: {
  slug: string;
  parentSlug: string | null;
  options: ParentOption[];
}) {
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    startTransition(async () => {
      const result = await setCategoryParent(slug, value);
      if (result.error) toast.error(result.error);
      else toast.success("Catégorie déplacée.");
    });
  }

  return (
    <select
      aria-label="Catégorie parente"
      value={parentSlug ?? ""}
      onChange={handleChange}
      disabled={pending}
      className="h-8 rounded-md border border-stone/40 bg-sand px-2 text-xs font-medium text-earth focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-forest disabled:opacity-50"
    >
      <option value="">Racine</option>
      {options.map((o) => (
        <option key={o.slug} value={o.slug}>
          ↳ {o.label}
        </option>
      ))}
    </select>
  );
}
