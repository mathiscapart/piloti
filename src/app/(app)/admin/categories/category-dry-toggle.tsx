"use client";

import { Droplets } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

export function CategoryDryToggle({
  slug,
  canDry,
  action,
}: {
  slug: string;
  canDry: boolean;
  action: (slug: string, canDry: boolean) => Promise<{ error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = await action(slug, !canDry);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={canDry ? "Séchage activé" : "Séchage désactivé"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
        canDry
          ? "bg-sky-soft text-sky-ink"
          : "bg-sand text-trail hover:bg-stone/30",
      )}
    >
      <Droplets className="size-3.5" />
      {canDry ? "Séchage" : "Séchage off"}
    </button>
  );
}
