"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CategoryDeleteButton({
  slug,
  action,
}: {
  slug: string;
  action: (slug: string) => Promise<{ error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await action(slug);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Catégorie supprimée.");
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleDelete}
      className="text-brick hover:border-brick hover:bg-brick-soft hover:text-brick-ink"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
