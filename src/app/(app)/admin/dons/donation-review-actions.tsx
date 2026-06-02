"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveDonation,
  rejectDonation,
} from "@/modules/inventory/donation-actions";

export function DonationReviewActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function handleApprove() {
    startTransition(async () => {
      const result = await approveDonation(id);
      if (result.error) toast.error(result.error);
      else toast.success("Don validé : article ajouté au stock.");
    });
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectDonation(id, reason || undefined);
      if (result.error) toast.error(result.error);
      else toast.success("Don refusé.");
      setRejecting(false);
      setReason("");
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motif (optionnel)"
          className="w-48"
        />
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={handleReject}
        >
          Confirmer le refus
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setRejecting(false)}
        >
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="success"
        size="sm"
        disabled={pending}
        onClick={handleApprove}
      >
        <Check className="size-4" />
        Valider
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="text-brick hover:border-brick hover:bg-brick-soft"
      >
        <X className="size-4" />
        Refuser
      </Button>
    </div>
  );
}
