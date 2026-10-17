"use client";

import { ArchiveRestore } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { restoreEquipment } from "@/modules/inventory/actions";

export function RestoreButton({ id }: { id: string }) {
  const [pending, start] = useTransition();

  function handle() {
    start(async () => {
      const result = await restoreEquipment(id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Button type="button" className="flex-1" onClick={handle} disabled={pending}>
      <ArchiveRestore className="size-4" />
      {pending ? "Restauration…" : "Restaurer"}
    </Button>
  );
}
