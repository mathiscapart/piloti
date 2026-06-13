"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveExpenses } from "@/modules/finance/actions";

// US-F07 — validation en lot : approuve toutes les notes en attente affichées.
export function BatchApproveButton({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (ids.length === 0) return null;

  function approveAll() {
    if (!confirm(`Approuver les ${ids.length} notes en attente ?`)) return;
    start(async () => {
      const res = await approveExpenses(ids);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(`${res.approved} note(s) approuvée(s).`);
        router.refresh();
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="success"
      disabled={pending}
      onClick={approveAll}
    >
      <CheckCheck className="size-4" />
      Tout approuver ({ids.length})
    </Button>
  );
}
