import "server-only";

import { db } from "@/lib/db";
import type { CampEquipment } from "@/lib/enums";

// US-L01…L06 — lieux de camp : requêtes de lecture.

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export interface PlaceListFilter {
  region?: string;
  minCapacity?: number;
  equipment?: CampEquipment[];
  sort?: "rating" | "capacity" | "name";
}

export interface PlaceListItem {
  id: string;
  name: string;
  region: string | null;
  address: string | null;
  capacity: number | null;
  equipment: string[];
  photo: string | null;
  latitude: number | null;
  longitude: number | null;
  avgRating: number | null;
  reviewCount: number;
}

// US-L01 — liste filtrable + triable. Les filtres « équipements » et la note
// sont appliqués en JS (équipements stockés en JSON, note dérivée des avis).
export async function listPlaces(
  filter: PlaceListFilter = {},
): Promise<{ items: PlaceListItem[]; regions: string[] }> {
  const places = await db.campPlace.findMany({
    where: {
      archived: false,
      ...(filter.region ? { region: filter.region } : {}),
      ...(filter.minCapacity ? { capacity: { gte: filter.minCapacity } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      region: true,
      address: true,
      capacity: true,
      equipmentJson: true,
      photosJson: true,
      latitude: true,
      longitude: true,
      reviews: { select: { rating: true } },
    },
  });

  const wanted = filter.equipment ?? [];
  let items: PlaceListItem[] = places
    .map((p) => {
      const equipment = parseJsonArray(p.equipmentJson);
      const photos = parseJsonArray(p.photosJson);
      const ratings = p.reviews.map((r) => r.rating);
      const avg =
        ratings.length > 0
          ? ratings.reduce((a, r) => a + r, 0) / ratings.length
          : null;
      return {
        id: p.id,
        name: p.name,
        region: p.region,
        address: p.address,
        capacity: p.capacity,
        equipment,
        photo: photos[0] ?? null,
        latitude: p.latitude,
        longitude: p.longitude,
        avgRating: avg,
        reviewCount: ratings.length,
      };
    })
    .filter((p) => wanted.every((e) => p.equipment.includes(e)));

  const sort = filter.sort ?? "name";
  items = items.sort((a, b) => {
    if (sort === "rating") return (b.avgRating ?? -1) - (a.avgRating ?? -1);
    if (sort === "capacity") return (b.capacity ?? 0) - (a.capacity ?? 0);
    return a.name.localeCompare(b.name, "fr");
  });

  // Régions distinctes (pour alimenter le filtre), tous lieux non archivés.
  const regions = [
    ...new Set(
      places.map((p) => p.region).filter((r): r is string => !!r && r.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  return { items, regions };
}

// Points pour la carte (US-L02) : uniquement les lieux géocodés.
export async function listPlacePins(): Promise<
  { id: string; name: string; latitude: number; longitude: number; avgRating: number | null }[]
> {
  const places = await db.campPlace.findMany({
    where: { archived: false, latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      reviews: { select: { rating: true } },
    },
  });
  return places.map((p) => {
    const ratings = p.reviews.map((r) => r.rating);
    return {
      id: p.id,
      name: p.name,
      latitude: p.latitude!,
      longitude: p.longitude!,
      avgRating:
        ratings.length > 0
          ? ratings.reduce((a, r) => a + r, 0) / ratings.length
          : null,
    };
  });
}

// Options (id + nom) pour un sélecteur — ex. rattacher un événement à un lieu.
export async function listPlaceOptions(): Promise<{ id: string; name: string }[]> {
  return db.campPlace.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// US-L03 — fiche détaillée : données + équipements + contact + avis + note
// moyenne + historique des camps + historique des modifications (audit).
export async function getPlaceDetail(id: string) {
  const place = await db.campPlace.findUnique({
    where: { id },
    include: {
      reviews: { orderBy: { createdAt: "desc" } },
      events: {
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, startDate: true, endDate: true, unit: true },
      },
    },
  });
  if (!place || place.archived) return null;

  const ratings = place.reviews.map((r) => r.rating);
  const avgRating =
    ratings.length > 0 ? ratings.reduce((a, r) => a + r, 0) / ratings.length : null;

  // Auteurs des avis (noms) — résolus en une requête.
  const authorIds = [
    ...new Set(place.reviews.map((r) => r.authorId).filter((x): x is string => !!x)),
  ];
  const authors = authorIds.length
    ? await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, firstName: true, lastName: true, image: true },
      })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));

  // US-L05 — historique des modifications via le journal d'audit.
  const auditRows = await db.auditLog.findMany({
    where: {
      action: { in: ["PLACE_CREATED", "PLACE_UPDATED", "PLACE_ARCHIVED"] },
      metadata: { contains: `"placeId":"${id}"` },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, action: true, userId: true, createdAt: true },
  });
  const editorIds = [...new Set(auditRows.map((a) => a.userId))];
  const editors = editorIds.length
    ? await db.user.findMany({
        where: { id: { in: editorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const editorById = new Map(editors.map((e) => [e.id, e]));

  return {
    place,
    equipment: parseJsonArray(place.equipmentJson),
    photos: parseJsonArray(place.photosJson),
    avgRating,
    reviewCount: ratings.length,
    reviews: place.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      author: r.authorId ? (authorById.get(r.authorId) ?? null) : null,
    })),
    history: place.events,
    modifications: auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.createdAt,
      editor: editorById.get(a.userId) ?? null,
    })),
  };
}

export type PlaceDetail = NonNullable<Awaited<ReturnType<typeof getPlaceDetail>>>;
