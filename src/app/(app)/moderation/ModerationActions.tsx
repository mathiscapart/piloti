"use client";

import { Check, EyeOff, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReportTargetType } from "@/lib/enums";
import {
  dismissReport,
  hideMessage,
  resolveReport,
} from "@/modules/communication/moderation-actions";

// SAFE-02 — actions de traitement d'un signalement : masquer le message visé
// (idempotent, indépendant de l'issue du signalement) puis clore le
// signalement (résolu ou rejeté), avec un motif facultatif.
export function ModerationActions({
  reportId,
  targetType,
  targetId,
  alreadyHidden,
}: {
  reportId: string;
  targetType: ReportTargetType;
  targetId: string;
  alreadyHidden: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState<"resolve" | "dismiss" | null>(null);
  const [note, setNote] = useState("");

  function handleHide() {
    startTransition(async () => {
      const result = await hideMessage(targetType, targetId);
      if (result.error) toast.error(result.error);
      else toast.success("Message masqué.");
    });
  }

  function handleClose(kind: "resolve" | "dismiss") {
    startTransition(async () => {
      const result =
        kind === "resolve"
          ? await resolveReport(reportId, note || undefined)
          : await dismissReport(reportId, note || undefined);
      if (result.error) toast.error(result.error);
      else toast.success(kind === "resolve" ? "Signalement résolu." : "Signalement rejeté.");
      setClosing(null);
      setNote("");
    });
  }

  if (closing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Motif (optionnel)"
          className="w-48"
        />
        <Button
          variant={closing === "resolve" ? "success" : "destructive"}
          size="sm"
          disabled={pending}
          onClick={() => handleClose(closing)}
        >
          Confirmer
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setClosing(null)}>
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {!alreadyHidden ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={handleHide}
          className="text-brick hover:border-brick hover:bg-brick-soft"
        >
          <EyeOff className="size-4" />
          Masquer
        </Button>
      ) : null}
      <Button variant="success" size="sm" disabled={pending} onClick={() => setClosing("resolve")}>
        <Check className="size-4" />
        Résoudre
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setClosing("dismiss")}>
        <X className="size-4" />
        Rejeter
      </Button>
    </div>
  );
}
