"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { withdrawRegistration } from "@/modules/planning/actions";

// US-P05 — un chef marque un désistement, motif obligatoire.
export function WithdrawRegistrationButton({
  eventId,
  userId,
}: {
  eventId: string;
  userId: string;
}) {
  const [pending, start] = useTransition();

  function onWithdraw() {
    const reason = prompt("Motif du désistement :") ?? "";
    if (reason.trim().length === 0) return;
    start(async () => {
      const res = await withdrawRegistration(eventId, userId, reason);
      if (res?.error) toast.error(res.error);
      else toast.success("Désistement enregistré.");
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={onWithdraw}
      className="text-brick hover:bg-brick-soft hover:text-brick-ink"
    >
      Désister
    </Button>
  );
}
