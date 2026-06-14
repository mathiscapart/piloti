import { ArrowLeft, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { listPlacePins } from "@/modules/camp/places";

import { PlacesMap } from "./PlacesMap";

export default async function PlacesMapPage() {
  const user = await getCurrentUser();
  if (!can(user, "place.view")) redirect("/dashboard");

  const pins = await listPlacePins();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/lieux"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour à la liste
        </Link>
      </div>

      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <MapIcon className="size-3.5" />
          Lieux de camp
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">Carte</h1>
      </header>

      {pins.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="Aucun lieu géolocalisé"
          description="Ajoute une adresse à tes lieux pour les voir apparaître sur la carte."
        />
      ) : (
        <PlacesMap pins={pins} />
      )}
    </div>
  );
}
