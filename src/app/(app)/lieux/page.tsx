import { Map, MapPin, Plus, Tent, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Stars } from "@/components/camp/Stars";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CAMP_EQUIPMENT,
  CAMP_EQUIPMENT_LABEL,
  type CampEquipment,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { listPlaces, type PlaceListFilter } from "@/modules/camp/places";

import { PlaceFilters } from "./PlaceFilters";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PlacesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!can(user, "place.view")) redirect("/dashboard");
  const canCreate = can(user, "place.create");

  const sp = await searchParams;
  const equipParam = one(sp.equip);
  const filter: PlaceListFilter = {
    region: one(sp.region),
    minCapacity: one(sp.minCapacity) ? Number(one(sp.minCapacity)) : undefined,
    equipment: equipParam
      ? (equipParam.split(",").filter((e) =>
          (CAMP_EQUIPMENT as readonly string[]).includes(e),
        ) as CampEquipment[])
      : undefined,
    sort: (one(sp.sort) as PlaceListFilter["sort"]) ?? "name",
  };

  const { items, regions } = await listPlaces(filter);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
            <Tent className="size-3.5" />
            Lieux de camp
          </p>
          <h1 className="text-3xl font-black text-earth md:text-4xl">
            Lieux de camp
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/lieux/carte">
              <Map className="size-4" />
              Carte
            </Link>
          </Button>
          {canCreate ? (
            <Button asChild size="sm">
              <Link href="/lieux/nouveau">
                <Plus className="size-4" />
                Ajouter
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <PlaceFilters regions={regions} />

      {items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucun lieu"
          description={
            canCreate
              ? "Ajoute un premier lieu de camp pour commencer la base partagée."
              : "Aucun lieu ne correspond à ces filtres."
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/lieux/${p.id}`}
                className="flex gap-3 rounded-2xl bg-snow p-3 shadow-card transition-colors hover:bg-sand/40"
              >
                <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Tent className="size-7 text-stone" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="truncate font-bold text-earth">{p.name}</p>
                    {p.reviewCount > 0 ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-trail">
                        <Stars value={p.avgRating} size="size-3.5" />
                        {p.avgRating!.toFixed(1)} ({p.reviewCount})
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-trail">
                    {[p.region, p.address].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {p.capacity ? (
                      <span className="flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-earth">
                        <Users className="size-3" />
                        {p.capacity}
                      </span>
                    ) : null}
                    {p.equipment.slice(0, 3).map((e) => (
                      <span
                        key={e}
                        className="rounded-full bg-forest-soft px-2 py-0.5 text-xs font-medium text-forest-ink"
                      >
                        {CAMP_EQUIPMENT_LABEL[e as CampEquipment] ?? e}
                      </span>
                    ))}
                    {p.equipment.length > 3 ? (
                      <span className="text-xs text-trail">
                        +{p.equipment.length - 3}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
