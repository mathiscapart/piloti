"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { submitOwnerDecision } from "@/modules/camp/owner-consent-actions";

/**
 * RGPD-09 — les deux choix offerts au propriétaire d'un lieu.
 *
 * Pas de `toast` ici, contrairement au reste de l'application : la personne qui
 * lit cette page n'est pas un utilisateur, elle arrive d'un email et repartira
 * aussitôt. Le retour doit rester visible à l'écran, pas disparaître au bout de
 * trois secondes.
 */
export function OwnerDecisionForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "GRANTED" | "REFUSED") {
    if (
      decision === "REFUSED" &&
      !window.confirm(
        "Demander l'effacement de vos coordonnées ?\n\n" +
          "Elles seront supprimées immédiatement et définitivement. " +
          "Le groupe ne pourra plus vous contacter via son application.",
      )
    )
      return;

    setError(null);
    start(async () => {
      const res = await submitOwnerDecision(token, decision);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={pending} onClick={() => decide("GRANTED")}>
          J&apos;accepte
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => decide("REFUSED")}
        >
          Je refuse et demande l&apos;effacement
        </Button>
      </div>
      {error ? <p className="text-sm font-bold text-brick">{error}</p> : null}
    </div>
  );
}
