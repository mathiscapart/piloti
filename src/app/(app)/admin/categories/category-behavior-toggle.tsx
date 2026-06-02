"use client";

import { Droplets, Scale } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  updateCategoryBehavior,
  type CategoryBehavior,
} from "@/modules/inventory/category-actions";

const META: Record<
  CategoryBehavior,
  { icon: typeof Droplets; on: string; off: string; tone: string }
> = {
  canDry: {
    icon: Droplets,
    on: "Séchage",
    off: "Séchage off",
    tone: "bg-sky-soft text-sky-ink",
  },
  requireWeighing: {
    icon: Scale,
    on: "Pesée au retour",
    off: "Pesée off",
    tone: "bg-sun-soft text-sun-ink",
  },
};

// US-17 — bascule un comportement de catégorie (séchage, pesée…). Hérité par
// tous les articles de la catégorie.
export function CategoryBehaviorToggle({
  slug,
  behavior,
  active,
}: {
  slug: string;
  behavior: CategoryBehavior;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const meta = META[behavior];
  const Icon = meta.icon;

  function handleToggle() {
    startTransition(async () => {
      const result = await updateCategoryBehavior(slug, behavior, !active);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      title={active ? meta.on : meta.off}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
        active ? meta.tone : "bg-sand text-trail hover:bg-stone/30",
      )}
    >
      <Icon className="size-3.5" />
      {active ? meta.on : meta.off}
    </button>
  );
}
