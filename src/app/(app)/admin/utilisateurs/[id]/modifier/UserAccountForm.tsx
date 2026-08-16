"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUserAccount } from "@/modules/admin/actions";
import type { ActionResult } from "@/lib/types";

const initialState: ActionResult = { error: null };

interface UserAccountFormProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    canLogin: boolean;
  };
}

// US-CM-01 (évolution) — édition complète d'un compte par l'admin/secrétaire.
// Cas sensible : sur un compte enfant (canLogin: false), renseigner une vraie
// adresse email (qui ne correspond plus au pattern @piloti.invalid) rend
// AUTOMATIQUEMENT ce compte connectable — pas de case à cocher séparée.
// Reste sur la page après l'enregistrement (point central de gestion du
// compte, cf. section "Gestion du compte" plus bas) plutôt que de renvoyer
// vers la liste.
export function UserAccountForm({ user }: UserAccountFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateUserAccount,
    initialState,
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      toast.success("Compte mis à jour.");
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state.error, router]);

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl bg-snow p-5 shadow-card"
    >
      <input type="hidden" name="userId" value={user.id} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Prénom</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={user.firstName}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Nom</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={user.lastName}
            required
          />
        </div>
      </div>

      {user.canLogin === false ? (
        <p className="rounded-md border border-forest/30 bg-forest-soft px-3 py-2 text-sm text-forest-ink">
          Ce compte n&apos;a pas de connexion propre (compte enfant, cf.
          US-CM-01). Renseigner une vraie adresse email ici rendra ce compte
          connectable.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={user.email}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Téléphone</Label>
        <Input id="phone" name="phone" defaultValue={user.phone ?? ""} />
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
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
