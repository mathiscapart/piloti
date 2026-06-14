"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_HINT } from "@/lib/password-policy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNITS } from "@/lib/enums";
import { cn } from "@/lib/utils";

import { signUpAction, type SignUpActionResult } from "./actions";

const initialState: SignUpActionResult = { error: null, success: null };

const UNIT_LABELS: Record<(typeof UNITS)[number], string> = {
  FARFADETS: "Farfadets (6-8 ans)",
  LOUVETEAUX: "Louveteaux-Jeannettes (8-11 ans)",
  SCOUTS: "Scouts-Guides (11-14 ans)",
  PIONNIERS: "Pionniers-Caravelles (14-17 ans)",
  COMPAGNONS: "Compagnons (17-21 ans)",
  ADULTES: "Adultes (responsables, local)",
};

type ProfileType = "UNIT" | "PARENT";

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUpAction, initialState);
  const [profileType, setProfileType] = useState<ProfileType>("UNIT");

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
          minLength={12}
          autoComplete="new-password"
        />
        <p className="text-xs text-trail">{PASSWORD_HINT}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </div>

      {/* US-26 — type de profil : parent (sans unité) ou membre d'une unité. */}
      <div className="space-y-1.5">
        <Label>Vous êtes</Label>
        <input type="hidden" name="profileType" value={profileType} />
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "UNIT", label: "Membre d'une unité", hint: "Jeune ou chef" },
              { value: "PARENT", label: "Parent", hint: "Parent d'un jeune" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setProfileType(opt.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                profileType === opt.value
                  ? "border-forest bg-forest-soft"
                  : "border-stone bg-snow hover:bg-sand",
              )}
            >
              <span className="block text-sm font-bold text-earth">{opt.label}</span>
              <span className="block text-xs text-trail">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {profileType === "UNIT" ? (
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
      ) : (
        <p className="rounded-lg bg-sand px-3 py-2 text-xs text-trail">
          En tant que parent, vous pourrez renseigner vos compétences et
          disponibilités pour aider le groupe une fois votre compte validé.
        </p>
      )}

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
