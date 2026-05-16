"use client";

import { Archive } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { archiveEquipment } from "@/modules/inventory/actions";

export function ArchiveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();

  function handle() {
    if (!confirm("Archiver cet article ? Il sera masqué du catalogue.")) return;
    start(async () => {
      const result = await archiveEquipment(id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      onClick={handle}
      disabled={pending}
    >
      <Archive className="size-4" />
      {pending ? "Archivage…" : "Archiver l'article"}
    </Button>
  );
}
