"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  archiveCategory,
  unarchiveCategory,
} from "@/modules/inventory/category-actions";

// US-31 — terminologie « Archiver » (jamais « Supprimer »). « Autre » n'a pas
// d'action d'archivage (réceptacle par défaut non archivable).
export function CategoryArchiveButton({
  slug,
  archived,
}: {
  slug: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = archived
        ? await unarchiveCategory(slug)
        : await archiveCategory(slug);
      if (result.error) toast.error(result.error);
      else toast.success(archived ? "Catégorie restaurée." : "Catégorie archivée.");
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleClick}
      title={archived ? "Restaurer" : "Archiver"}
      className={
        archived
          ? "text-forest hover:border-forest hover:bg-forest/10"
          : "text-trail hover:border-stone hover:bg-sand"
      }
    >
      {archived ? (
        <ArchiveRestore className="size-4" />
      ) : (
        <Archive className="size-4" />
      )}
    </Button>
  );
}
