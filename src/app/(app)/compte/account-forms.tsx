"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PASSWORD_HINT } from "@/lib/password-policy";
import type { ActionResult } from "@/lib/types";

import {
  changeOwnPassword,
  updateOwnAvatar,
  updateOwnProfile,
  updateOwnSkillsProfile,
} from "./actions";

const emptyState: ActionResult = { error: null };

// Photo de profil — téléversement / suppression en auto-service.
export function AvatarForm({
  image,
  firstName,
  lastName,
}: {
  image: string | null;
  firstName: string;
  lastName: string;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(image);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateOwnAvatar,
    emptyState,
  );

  useEffect(() => {
    if (state.error === null && state !== emptyState) {
      toast.success("Photo de profil mise à jour.");
      router.refresh();
    }
  }, [state, router]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  }

  return (
    <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Photo de profil</h2>
      <form action={formAction} className="flex items-center gap-4">
        <UserAvatar
          image={preview}
          firstName={firstName}
          lastName={lastName}
          className="size-20 text-2xl"
        />
        <div className="space-y-2">
          <input
            type="file"
            name="avatar"
            accept="image/*"
            onChange={onPick}
            className="block w-full text-sm text-trail file:mr-3 file:rounded-full file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-earth hover:file:bg-sand/70"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Envoi…" : "Enregistrer la photo"}
            </Button>
            {image ? (
              <Button
                type="submit"
                name="remove"
                value="1"
                size="sm"
                variant="outline"
                disabled={pending}
              >
                Supprimer
              </Button>
            ) : null}
          </div>
          {state.error ? (
            <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

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

// US-26 — compétences & disponibilités, renseignées par l'utilisateur lui-même
// (parent) pour l'annuaire du groupe. Le consentement RGPD pilote la visibilité.
export function SkillsProfileForm({
  profession,
  skills,
  availability,
  helpNotes,
  skillsConsent,
}: {
  profession: string;
  skills: string;
  availability: string;
  helpNotes: string;
  skillsConsent: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateOwnSkillsProfile,
    emptyState,
  );

  useEffect(() => {
    if (state.error === null && state !== emptyState) {
      toast.success("Compétences enregistrées.");
      router.refresh();
    }
  }, [state, router]);

  return (
    <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
      <div>
        <h2 className="font-bold text-earth">Compétences &amp; disponibilités</h2>
        <p className="text-sm text-trail">
          Aidez le groupe : indiquez ce sur quoi vous pouvez donner un coup de
          main. Ces infos n&apos;apparaissent dans l&apos;annuaire que si vous
          donnez votre consentement ci-dessous.
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="profession">Profession</Label>
          <Input
            id="profession"
            name="profession"
            defaultValue={profession}
            placeholder="Électricien, comptable, infirmier…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="skills">Compétences / savoir-faire utiles</Label>
          <Textarea
            id="skills"
            name="skills"
            rows={2}
            defaultValue={skills}
            placeholder="Bricolage, électricité, couture, compta, transport, santé…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="availability">Disponibilités / envie d&apos;aider</Label>
          <Textarea
            id="availability"
            name="availability"
            rows={2}
            defaultValue={availability}
            placeholder="Ponctuel, événements, logistique, entretien du local…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="helpNotes">Informations complémentaires</Label>
          <Textarea
            id="helpNotes"
            name="helpNotes"
            rows={2}
            defaultValue={helpNotes}
          />
        </div>

        <label className="flex items-start gap-2 rounded-lg bg-sand p-3">
          <input
            type="checkbox"
            name="skillsConsent"
            defaultChecked={skillsConsent}
            className="mt-0.5 size-4 accent-forest"
          />
          <span className="text-sm text-earth">
            J&apos;accepte que ces informations soient visibles par l&apos;équipe
            de groupe dans l&apos;annuaire des compétences (RGPD). Sans
            consentement, mon profil n&apos;y apparaît pas.
          </span>
        </label>

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

// Changement de mot de passe en auto-service (Server Action : politique
// `passwordSchema`, mot de passe actuel exigé, audit).
export function PasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    changeOwnPassword,
    emptyState,
  );

  useEffect(() => {
    if (state.error === null && state !== emptyState) {
      toast.success("Mot de passe modifié.");
    }
  }, [state]);

  return (
    <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Changer mon mot de passe</h2>
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="current">Mot de passe actuel</Label>
          <Input
            id="current"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next">Nouveau mot de passe</Label>
          <Input
            id="next"
            name="newPassword"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
          <p className="text-xs text-trail">{PASSWORD_HINT}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
          <Input
            id="confirm"
            name="confirmPassword"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </div>
        {state.error ? (
          <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Modification…" : "Modifier le mot de passe"}
        </Button>
      </form>
    </section>
  );
}
