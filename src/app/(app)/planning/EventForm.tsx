"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  UNITS,
  UNIT_LABEL,
  type EventType,
  type Unit,
} from "@/lib/enums";
import type { ActionResult } from "@/lib/types";

const emptyState: ActionResult = { error: null };

export interface EventFormValues {
  name: string;
  type: string;
  startDate: string; // "YYYY-MM-DDTHH:mm"
  endDate: string;
  unit: string; // "" = tout le groupe
  location: string;
  description: string;
}

export function EventForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaults?: Partial<EventFormValues>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    action,
    emptyState,
  );

  useEffect(() => {
    // Succès = redirection serveur ; ici on n'affiche un toast que sur erreur.
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Titre</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={defaults?.name ?? ""}
          placeholder="Réunion de rentrée, week-end de groupe…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            defaultValue={defaults?.type ?? "REUNION"}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t as EventType]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Branche concernée</Label>
          <select
            id="unit"
            name="unit"
            defaultValue={defaults?.unit ?? ""}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            <option value="">Tout le groupe</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u as Unit]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Début</Label>
          <Input
            id="startDate"
            name="startDate"
            type="datetime-local"
            required
            defaultValue={defaults?.startDate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">Fin</Label>
          <Input
            id="endDate"
            name="endDate"
            type="datetime-local"
            required
            defaultValue={defaults?.endDate ?? ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">Lieu</Label>
        <Input
          id="location"
          name="location"
          maxLength={200}
          defaultValue={defaults?.location ?? ""}
          placeholder="Local scout, gare de…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={defaults?.description ?? ""}
          placeholder="Infos pratiques, matériel à apporter, horaires détaillés…"
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
