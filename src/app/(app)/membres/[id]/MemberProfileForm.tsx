"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateMemberProfile } from "@/modules/admin/actions";
import type { ActionResult } from "@/lib/types";

const initialState: ActionResult = { error: null };

interface Props {
  userId: string;
  profession: string | null;
  skills: string | null;
  availability: string | null;
  helpNotes: string | null;
  skillsConsent: boolean;
}

export function MemberProfileForm({
  userId,
  profession,
  skills,
  availability,
  helpNotes,
  skillsConsent,
}: Props) {
  const [state, formAction, pending] = useActionState(
    updateMemberProfile,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-stone/60 bg-snow p-5"
    >
      <input type="hidden" name="userId" value={userId} />
      <h3 className="font-bold text-earth">Profil &amp; compétences (parent)</h3>

      <div className="space-y-1.5">
        <Label htmlFor="profession">Profession</Label>
        <Input
          id="profession"
          name="profession"
          defaultValue={profession ?? ""}
          placeholder="Électricien, comptable, infirmier…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="skills">Compétences / savoir-faire utiles</Label>
        <Textarea
          id="skills"
          name="skills"
          rows={2}
          defaultValue={skills ?? ""}
          placeholder="Bricolage, électricité, couture, compta, transport, santé…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="availability">Disponibilités / envie d&apos;aider</Label>
        <Textarea
          id="availability"
          name="availability"
          rows={2}
          defaultValue={availability ?? ""}
          placeholder="Ponctuel, événements, logistique, entretien du local…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="helpNotes">Informations complémentaires</Label>
        <Textarea
          id="helpNotes"
          name="helpNotes"
          rows={2}
          defaultValue={helpNotes ?? ""}
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
          Le parent consent à l&apos;usage de ces informations pour
          l&apos;annuaire des compétences (RGPD). Sans consentement, le profil
          n&apos;apparaît pas dans l&apos;annuaire.
        </span>
      </label>

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
          {pending ? "Enregistrement…" : "Enregistrer le profil"}
        </Button>
      </div>
    </form>
  );
}
