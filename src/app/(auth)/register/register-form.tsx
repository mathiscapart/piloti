"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNITS } from "@/lib/enums";

import { signUpAction, type SignUpActionResult } from "./actions";

const initialState: SignUpActionResult = { error: null, success: null };

const UNIT_LABELS: Record<(typeof UNITS)[number], string> = {
  BLEUS: "Bleus (8-11 ans)",
  VERTS: "Verts (8-11 ans)",
  ROUGES: "Rouges (8-11 ans)",
  PIOS: "Pionniers (14-17 ans)",
  COMPAS: "Compagnons (17-21 ans)",
};

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUpAction, initialState);

  if (state.success) {
    return (
      <div
        role="status"
        className="space-y-4 rounded-2xl bg-snow p-6 shadow-card"
      >
        <p className="font-medium text-forest">{state.success}</p>
        <p className="text-sm text-trail">
          Vous recevrez un message dès qu&apos;un administrateur l&apos;aura
          validée.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl bg-snow p-6 shadow-card"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Prénom</Label>
          <Input id="firstName" name="firstName" required autoComplete="given-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Nom</Label>
          <Input id="lastName" name="lastName" required autoComplete="family-name" />
        </div>
      </div>

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

      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-trail">8 caractères minimum.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="unit">Unité (optionnel)</Label>
        <Select name="unit">
          <SelectTrigger id="unit">
            <SelectValue placeholder="Choisir une unité…" />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u} value={u}>
                {UNIT_LABELS[u]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Téléphone (optionnel)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="06 12 34 56 78"
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
        {pending ? "Création…" : "Demander un accès"}
      </Button>
    </form>
  );
}
