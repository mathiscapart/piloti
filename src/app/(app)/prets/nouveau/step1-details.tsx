"use client";

import Link from "next/link";

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
import type { BorrowerOption } from "@/modules/inventory/queries";

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface Props {
  // null = mode « jeune » : emprunteur forcé à soi-même (pas d'annuaire).
  borrowers: BorrowerOption[] | null;
  self: { id: string; label: string };
  details: {
    borrowerId: string;
    startDate: string;
    expectedReturn: string;
    eventName: string;
    eventId: string;
  };
  // US-P12 — événements à venir pour rattacher le prêt (optionnel).
  events: { id: string; name: string }[];
}

export function Step1Details({ borrowers, self, details, events }: Props) {
  // Formulaire GET : passe emprunteur + dates + événement à l'étape 2 via l'URL,
  // où la disponibilité du matériel sera calculée pour cette période (US-12).
  return (
    <form
      method="GET"
      action="/prets/nouveau"
      className="space-y-5 rounded-2xl bg-snow p-6 shadow-card"
    >
      <input type="hidden" name="step" value="2" />

      {borrowers === null ? (
        // Jeune : emprunteur = lui-même, non modifiable.
        <div className="space-y-1.5">
          <Label>Emprunteur</Label>
          <input type="hidden" name="borrowerId" value={self.id} />
          <p className="rounded-lg bg-sand px-3 py-2 text-sm font-medium text-earth">
            {self.label} (toi)
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="borrowerId">Emprunteur</Label>
          <Select name="borrowerId" required defaultValue={details.borrowerId || undefined}>
            <SelectTrigger id="borrowerId">
              <SelectValue placeholder="Choisir un membre…" />
            </SelectTrigger>
            <SelectContent>
              {borrowers.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.firstName} {b.lastName}
                  {b.unit ? ` · ${b.unit}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="startDate">Date de départ</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={details.startDate || today()}
            className="w-full"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expectedReturn">Date de retour prévue</Label>
          <Input
            id="expectedReturn"
            name="expectedReturn"
            type="date"
            required
            defaultValue={details.expectedReturn || inDays(7)}
            className="w-full"
          />
          <p className="text-xs text-trail">
            Date commune ; tu pourras l&apos;ajuster par article à l&apos;étape
            suivante.
          </p>
        </div>
      </div>

      {/* US-P12 — rattacher à un événement du planning (optionnel). */}
      {events.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="eventId">Événement du planning (optionnel)</Label>
          <select
            id="eventId"
            name="eventId"
            defaultValue={details.eventId}
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            <option value="">Aucun</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-trail">
            Rattache le matériel mobilisé à un événement du calendrier.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="eventName">
          {events.length > 0 ? "Ou nom libre (optionnel)" : "Événement (optionnel)"}
        </Label>
        <Input
          id="eventName"
          name="eventName"
          defaultValue={details.eventName}
          placeholder="Week-end Pios 9/10, Réunion Bleus…"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/prets"
          className="text-sm font-bold text-trail hover:text-earth"
        >
          Annuler
        </Link>
        <Button type="submit">Choisir le matériel →</Button>
      </div>
    </form>
  );
}
