"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import type { ActionResult } from "@/lib/types";

import { updateOwnProfile } from "./actions";

const emptyState: ActionResult = { error: null };

// Coordonnées (prénom, nom, téléphone) — éditables par l'utilisateur lui-même.
export function ProfileForm({
  firstName,
  lastName,
  phone,
}: {
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateOwnProfile,
    emptyState,
  );

  useEffect(() => {
    if (state.error === null && state !== emptyState) {
      toast.success("Profil mis à jour.");
      router.refresh();
    }
  }, [state, router]);

  return (
    <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Mes coordonnées</h2>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Prénom</Label>
            <Input id="firstName" name="firstName" defaultValue={firstName} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Nom</Label>
            <Input id="lastName" name="lastName" defaultValue={lastName} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={phone}
            placeholder="06 12 34 56 78"
          />
        </div>
        {state.error ? (
          <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>
    </section>
  );
}

// Changement de mot de passe en auto-service (better-auth, exige l'actuel).
export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }
    start(async () => {
      const { error: authError } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (authError) {
        setError(
          authError.message ??
            "Impossible de changer le mot de passe (mot de passe actuel incorrect ?).",
        );
        return;
      }
      toast.success("Mot de passe modifié.");
      setCurrent("");
      setNext("");
      setConfirm("");
    });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Changer mon mot de passe</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="current">Mot de passe actuel</Label>
          <Input
            id="current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next">Nouveau mot de passe</Label>
          <Input
            id="next"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <p className="text-xs text-trail">12 caractères minimum.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
        </div>
        {error ? (
          <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Modification…" : "Modifier le mot de passe"}
        </Button>
      </form>
    </section>
  );
}
