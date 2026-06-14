"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { archivePlace } from "@/modules/camp/place-actions";

export function ArchivePlaceButton({
  placeId,
  name,
}: {
  placeId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function submit() {
    if (!window.confirm(`Archiver le lieu « ${name} » ? Il ne sera plus listé.`))
      return;
    start(async () => {
      const res = await archivePlace(placeId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Lieu archivé.");
        router.push("/lieux");
        router.refresh();
      }
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={submit}>
      <Trash2 className="size-4 text-brick" />
      Archiver
    </Button>
  );
}
