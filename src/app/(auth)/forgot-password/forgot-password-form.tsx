"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { forgotPasswordAction } from "./actions";

const initialState = { error: null, sent: false };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialState);

  if (state.sent) {
    return (
      <div className="space-y-3 rounded-2xl bg-snow p-6 shadow-card">
        <p className="font-bold text-forest">Email envoyé !</p>
        <p className="text-sm text-trail">
          Si un compte existe avec cet email, vous recevrez un lien de
          réinitialisation valable 1 heure. Vérifiez vos spams si nécessaire.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl bg-snow p-6 shadow-card">
      <p className="text-sm text-trail">
        Entrez votre email pour recevoir un lien de réinitialisation.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="prenom.nom@sgdf.fr"
        />
      </div>
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer le lien"}
      </Button>
    </form>
  );
}
