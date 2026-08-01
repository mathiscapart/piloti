"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NO_LOGIN_UNITS, UNIT_LABEL, type Unit } from "@/lib/enums";
import { createChildAccount } from "@/modules/admin/actions";
import type { listActiveParents } from "@/modules/family/queries";
import type { ActionResult } from "@/lib/types";

const initialState: ActionResult = { error: null };

interface ChildAccountFormProps {
  parents: Awaited<ReturnType<typeof listActiveParents>>;
}

// US-CM-01 — création d'un compte enfant (Farfadets/Louveteaux), sans
// connexion propre : géré par un parent, sélectionné parmi les comptes
// PARENT actifs (jamais saisi en texte libre — élimine les fautes de frappe
// sur l'enregistrement légal). D'autres parents restent rattachables ensuite
// depuis la fiche membre, section Famille. Capture l'attestation de
// consentement parental reçue hors ligne (formulaire papier existant).
export function ChildAccountForm({ parents }: ChildAccountFormProps) {
  const [state, formAction, pending] = useActionState(
    createChildAccount,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
      toast.success(
        "Compte enfant créé et rattaché au parent sélectionné. Pour ajouter un second responsable, utilise la section Famille de sa fiche membre.",
      );
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-5 rounded-2xl bg-snow p-5 shadow-card"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Prénom</Label>
          <Input id="firstName" name="firstName" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Nom</Label>
          <Input id="lastName" name="lastName" required />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="unit">Branche</Label>
          <select
            id="unit"
            name="unit"
            required
            defaultValue=""
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            <option value="" disabled>
              Choisir une branche…
            </option>
            {NO_LOGIN_UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u as Unit]}
              </option>
            ))}
          </select>
          <p className="text-xs text-trail">
            Réservé aux Farfadets et Louveteaux-Jeannettes : les autres
            branches passent par l&apos;inscription habituelle.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birthDate">Date de naissance</Label>
          <Input id="birthDate" name="birthDate" type="date" required />
        </div>
      </div>

      <div className="space-y-3 rounded-xl bg-sand/60 p-4">
        <h3 className="text-sm font-bold text-earth">
          Attestation de consentement parental
        </h3>
        <p className="text-xs text-trail">
          Le formulaire papier a été signé par le responsable légal et classé
          hors application : sélectionne son compte et renseigne la date de
          l&apos;attestation pour en garder la trace.
        </p>
        {parents.length === 0 ? (
          <p
            role="alert"
            className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
          >
            Aucun parent inscrit pour l&apos;instant — le parent doit
            d&apos;abord créer/valider son compte avant que tu puisses créer
            celui de l&apos;enfant.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="guardianUserId">Responsable légal</Label>
              <select
                id="guardianUserId"
                name="guardianUserId"
                required
                defaultValue=""
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
              >
                <option value="" disabled>
                  Choisir un parent…
                </option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attestationDate">Date de l&apos;attestation</Label>
              <Input
                id="attestationDate"
                name="attestationDate"
                type="date"
                required
              />
            </div>
          </div>
        )}
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || parents.length === 0}>
          {pending ? "Création…" : "Créer le compte enfant"}
        </Button>
      </div>
    </form>
  );
}
