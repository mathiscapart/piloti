"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requiresParentalConsent } from "@/lib/legal/age";
import type { ActionResult } from "@/lib/types";

import { completeBirthDate } from "./actions";

const emptyState: ActionResult = { error: null };

// SAFE-01 — écran bloquant de complétion de profil : demande la seule
// information manquante (date de naissance), avec exactement les mêmes bornes
// que l'inscription (birthDateSchema, source unique dans lib/legal/age.ts).
export function CompleteProfileForm() {
  const router = useRouter();
  const [birthDate, setBirthDate] = useState("");
  const minor = requiresParentalConsent(birthDate);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    completeBirthDate,
    emptyState,
  );

  useEffect(() => {
    if (state.error === null && state !== emptyState) {
      toast.success("Merci, votre profil est à jour.");
      router.push("/dashboard");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="birthDate">Date de naissance</Label>
        <Input
          id="birthDate"
          name="birthDate"
          type="date"
          required
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </div>

      {/* Mineur de moins de 15 ans : information, pas de blocage — la
          complétion a posteriori n'exige pas de ressaisir l'attestation
          parentale demandée à l'inscription. */}
      {minor ? (
        <p className="rounded-md border border-sand bg-sand/40 px-3 py-2 text-sm text-earth">
          Vous avez indiqué avoir moins de 15 ans : certaines fonctionnalités
          (comme la messagerie privée) resteront limitées, conformément à la
          protection des mineurs du groupe.
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Valider"}
      </Button>
    </form>
  );
}
