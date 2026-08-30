import { AlertCircle, ChevronRight } from "lucide-react";
import Link from "next/link";

import { UNIT_LABEL, type Unit } from "@/lib/enums";
import type { ChildSummary } from "@/modules/dashboard/queries";

// Ce qu'un parent voit en arrivant.
//
// Jusqu'ici : un encart « Bienvenue sur Piloti » qui le renvoyait ailleurs,
// alors que l'application connaît ses enfants. On montre ce qui le concerne, et
// surtout ce que lui seul peut compléter — le droit à l'image se demande au
// responsable légal, personne d'autre ne peut répondre à sa place.

const IMAGE_RIGHTS_LABEL: Record<string, string> = {
  OUI: "Droit à l'image accordé",
  NON: "Droit à l'image refusé",
  RESTREINT_INTERNE: "Droit à l'image limité au groupe",
};

export function MyChildren({ enfants }: { enfants: ChildSummary[] }) {
  if (enfants.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-black uppercase tracking-widest text-trail">
        {enfants.length > 1 ? "Mes enfants" : "Mon enfant"}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {enfants.map((enfant) => (
          <li key={enfant.id}>
            <Link
              href={`/membres/${enfant.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-snow p-4 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-earth">
                  {enfant.firstName} {enfant.lastName}
                </p>
                <p className="truncate text-xs text-trail">
                  {enfant.unit
                    ? (UNIT_LABEL[enfant.unit as Unit] ?? enfant.unit)
                    : "Sans branche"}
                </p>
                {enfant.imageRights ? (
                  <p className="mt-1 text-xs text-trail">
                    {IMAGE_RIGHTS_LABEL[enfant.imageRights] ?? enfant.imageRights}
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-fire-ink">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Droit à l&apos;image à renseigner
                  </p>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-trail" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
