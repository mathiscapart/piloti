"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { CAMP_EQUIPMENT } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { geocodeAddress } from "./geocode";

// US-L04/L05/L06 — actions sur les lieux de camp.

const VALID_EQUIPMENT = new Set<string>(CAMP_EQUIPMENT);

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

function parseCapacity(fd: FormData): number | null {
  const raw = str(fd, "capacity");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCoord(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function collectEquipment(fd: FormData): string[] {
  return fd
    .getAll("equipment")
    .map(String)
    .filter((e) => VALID_EQUIPMENT.has(e));
}

function collectPhotos(fd: FormData): string[] {
  return fd
    .getAll("photo")
    .map(String)
    .filter((u) => u.startsWith("/uploads/"))
    .slice(0, 8);
}

// US-L04 — créer une fiche lieu (géocodage best-effort de l'adresse).
export async function createPlace(
  fd: FormData,
): Promise<ActionResult & { id?: string }> {
  const user = await getCurrentUser();
  if (!can(user, "place.create")) return { error: "Permission refusée." };

  const name = str(fd, "name");
  if (!name) return { error: "Le nom est requis." };

  const address = str(fd, "address");
  let latitude = parseCoord(fd, "latitude");
  let longitude = parseCoord(fd, "longitude");
  // Géocodage automatique si pas de coordonnées manuelles mais une adresse.
  if ((latitude === null || longitude === null) && address) {
    const geo = await geocodeAddress(address);
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
  }

  const place = await withAudit(
    (tx) =>
      tx.campPlace.create({
        data: {
          name,
          address,
          region: str(fd, "region"),
          capacity: parseCapacity(fd),
          latitude,
          longitude,
          equipmentJson: JSON.stringify(collectEquipment(fd)),
          ownerName: str(fd, "ownerName"),
          ownerPhone: str(fd, "ownerPhone"),
          ownerEmail: str(fd, "ownerEmail"),
          notes: str(fd, "notes"),
          photosJson: JSON.stringify(collectPhotos(fd)),
          createdById: user.id,
        },
      }),
    (created) => ({
      action: "PLACE_CREATED",
      userId: user.id,
      metadata: { placeId: created.id, name },
    }),
  );

  revalidatePath("/lieux");
  return { error: null, id: place.id };
}

// US-L05 — modifier un lieu (chef créateur OU admin).
export async function updatePlace(
  placeId: string,
  fd: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "place.manage")) return { error: "Permission refusée." };

  const place = await db.campPlace.findUnique({
    where: { id: placeId },
    select: { id: true, createdById: true, address: true, latitude: true, longitude: true },
  });
  if (!place) return { error: "Lieu introuvable." };

  const isAdmin = effectiveRoles(user).includes("ADMIN");
  if (!isAdmin && place.createdById !== user.id) {
    return { error: "Seul le créateur du lieu (ou un admin) peut le modifier." };
  }

  const name = str(fd, "name");
  if (!name) return { error: "Le nom est requis." };

  const address = str(fd, "address");
  let latitude = parseCoord(fd, "latitude");
  let longitude = parseCoord(fd, "longitude");
  // Re-géocode si l'adresse a changé et qu'aucune coordonnée manuelle n'est fournie.
  if (
    (latitude === null || longitude === null) &&
    address &&
    address !== place.address
  ) {
    const geo = await geocodeAddress(address);
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
  }
  // À défaut, conserve les coordonnées existantes.
  if (latitude === null) latitude = place.latitude;
  if (longitude === null) longitude = place.longitude;

  await withAudit(
    (tx) =>
      tx.campPlace.update({
        where: { id: placeId },
        data: {
          name,
          address,
          region: str(fd, "region"),
          capacity: parseCapacity(fd),
          latitude,
          longitude,
          equipmentJson: JSON.stringify(collectEquipment(fd)),
          ownerName: str(fd, "ownerName"),
          ownerPhone: str(fd, "ownerPhone"),
          ownerEmail: str(fd, "ownerEmail"),
          notes: str(fd, "notes"),
          photosJson: JSON.stringify(collectPhotos(fd)),
        },
      }),
    { action: "PLACE_UPDATED", userId: user.id, metadata: { placeId, name } },
  );

  revalidatePath("/lieux");
  revalidatePath(`/lieux/${placeId}`);
  return { error: null };
}

// US-L05 — archiver un lieu (créateur ou admin).
export async function archivePlace(placeId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "place.manage")) return { error: "Permission refusée." };

  const place = await db.campPlace.findUnique({
    where: { id: placeId },
    select: { id: true, createdById: true },
  });
  if (!place) return { error: "Lieu introuvable." };
  const isAdmin = effectiveRoles(user).includes("ADMIN");
  if (!isAdmin && place.createdById !== user.id) {
    return { error: "Seul le créateur du lieu (ou un admin) peut l'archiver." };
  }

  await withAudit(
    (tx) =>
      tx.campPlace.update({ where: { id: placeId }, data: { archived: true } }),
    { action: "PLACE_ARCHIVED", userId: user.id, metadata: { placeId } },
  );

  revalidatePath("/lieux");
  return { error: null };
}

// US-L06 — déposer un avis (note 1–5 + commentaire) sur un lieu.
export async function addReview(
  placeId: string,
  ratingStr: string,
  comment: string,
  eventId?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "place.review")) return { error: "Permission refusée." };

  const rating = Number.parseInt(ratingStr, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { error: "Note invalide (1 à 5)." };
  }

  const place = await db.campPlace.findUnique({
    where: { id: placeId },
    select: { id: true },
  });
  if (!place) return { error: "Lieu introuvable." };

  const trimmed = comment.trim();

  await withAudit(
    (tx) =>
      tx.campPlaceReview.create({
        data: {
          placeId,
          authorId: user.id,
          eventId: eventId ?? null,
          rating,
          comment: trimmed.length > 0 ? trimmed : null,
        },
      }),
    { action: "PLACE_REVIEW_ADDED", userId: user.id, metadata: { placeId, rating } },
  );

  revalidatePath(`/lieux/${placeId}`);
  return { error: null };
}

// US-L03 — rattacher un événement (camp) à un lieu.
export async function linkEventToPlace(
  eventId: string,
  placeId: string | null,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "event.manage")) return { error: "Permission refusée." };

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return { error: "Événement introuvable." };
  if (placeId) {
    const place = await db.campPlace.findUnique({
      where: { id: placeId },
      select: { id: true },
    });
    if (!place) return { error: "Lieu introuvable." };
  }

  await withAudit(
    (tx) =>
      tx.event.update({ where: { id: eventId }, data: { campPlaceId: placeId } }),
    {
      action: "EVENT_PLACE_LINKED",
      userId: user.id,
      metadata: { eventId, placeId },
    },
  );

  revalidatePath(`/planning/${eventId}`);
  if (placeId) revalidatePath(`/lieux/${placeId}`);
  return { error: null };
}
