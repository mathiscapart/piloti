import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";

import { PlaceForm, type PlaceFormValues } from "../../PlaceForm";

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPlacePage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "place.manage")) redirect(`/lieux/${id}`);

  const place = await db.campPlace.findUnique({ where: { id } });
  if (!place || place.archived) notFound();

  const isAdmin = effectiveRoles(user).includes("ADMIN");
  if (!isAdmin && place.createdById !== user.id) redirect(`/lieux/${id}`);

  const initial: PlaceFormValues = {
    id: place.id,
    name: place.name,
    address: place.address ?? "",
    region: place.region ?? "",
    capacity: place.capacity != null ? String(place.capacity) : "",
    equipment: parseJsonArray(place.equipmentJson),
    ownerName: place.ownerName ?? "",
    ownerPhone: place.ownerPhone ?? "",
    ownerEmail: place.ownerEmail ?? "",
    notes: place.notes ?? "",
    photos: parseJsonArray(place.photosJson),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href={`/lieux/${id}`}
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour à la fiche
      </Link>

      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <MapPin className="size-3.5" />
          Lieux de camp
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          Modifier le lieu
        </h1>
      </header>

      <PlaceForm initial={initial} />
    </div>
  );
}
