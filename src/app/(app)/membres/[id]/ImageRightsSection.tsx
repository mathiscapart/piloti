"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  IMAGE_RIGHTS_LABEL,
  IMAGE_RIGHTS_STATUSES,
  type ImageRightsStatus,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { setImageRightsStatus } from "@/modules/consent/actions";
import type { ActionResult } from "@/lib/types";

const initialState: ActionResult = { error: null };

const STATUS_STYLE: Record<ImageRightsStatus, string> = {
  OUI: "bg-forest-soft text-forest-ink",
  NON: "bg-brick-soft text-brick-ink",
  RESTREINT_INTERNE: "bg-sun-soft text-sun-ink",
};

export function ImageRightsBadge({ status }: { status: ImageRightsStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full bg-sand px-2.5 py-0.5 text-xs font-bold text-trail">
        Non renseigné
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
        STATUS_STYLE[status],
      )}
    >
      {IMAGE_RIGHTS_LABEL[status]}
    </span>
  );
}

// US-C08 — droit à l'image : statut courant + formulaire d'édition (RG/SEC/
// ADMIN, cf. `member.image_rights.manage`). Lecture seule pour les autres
// profils ayant `member.view` (chefs, trésorier…).
export function ImageRightsSection({
  userId,
  status,
  canManage,
}: {
  userId: string;
  status: ImageRightsStatus | null;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    setImageRightsStatus,
    initialState,
  );

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-earth">Droit à l&apos;image</h2>
        <ImageRightsBadge status={status} />
      </div>

      {canManage ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <div className="min-w-0 flex-1">
            <select
              name="value"
              defaultValue={status ?? ""}
              required
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
            >
              <option value="" disabled>
                Choisir un statut…
              </option>
              {IMAGE_RIGHTS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {IMAGE_RIGHTS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {state.error ? (
            <p
              role="alert"
              className="w-full rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
            >
              {state.error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-trail">
          Lecture seule — réservé au responsable de groupe et à la
          secrétaire.
        </p>
      )}
    </section>
  );
}
