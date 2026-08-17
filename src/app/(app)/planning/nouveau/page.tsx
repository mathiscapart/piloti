import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listPlaceOptions } from "@/modules/camp/places";
import { getCurrentUser } from "@/lib/get-current-user";
import { UNITS } from "@/lib/enums";
import { can, scopedUnits } from "@/lib/permissions";
import { createEvent } from "@/modules/planning/actions";

import { EventForm } from "../EventForm";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!can(user, "event.manage")) redirect("/planning");

  const places = await listPlaceOptions();
  // Périmètre d'unité (D-024) : on ne propose que les branches sur lesquelles
  // le chef peut créer. `createEvent` revérifie — le filtre est un confort, pas
  // le contrôle.
  const units = scopedUnits(user, UNITS);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/planning"
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour au planning
      </Link>
      <h1 className="text-3xl font-black text-earth md:text-4xl">
        Nouvel événement
      </h1>
      <section className="rounded-2xl bg-snow p-5 shadow-card">
        <EventForm
          action={createEvent}
          submitLabel="Créer l'événement"
          places={places}
          units={units}
        />
      </section>
    </div>
  );
}
