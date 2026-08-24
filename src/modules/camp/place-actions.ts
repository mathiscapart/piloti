"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { CAMP_EQUIPMENT } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { refuseIfEventOutOfScope } from "@/modules/planning/event-scope";

import { geocodeAddress } from "./geocode";
import {
  newOwnerConsentToken,
  sendOwnerConsentRequest,
} from "./owner-consent";
import { parseOwnerEmail } from "./types";

// US-L04/L05/L06 — actions sur les lieux de camp.

const VALID_EQUIPMENT = new Set<string>(CAMP_EQUIPMENT);

// RGPD-09 — nom du groupe affiché au propriétaire dans l'email. Vient de
// l'environnement (CONF-01) : c'est l'identité de l'instance, pas du logiciel.
const GROUP_NAME = process.env.ORG_GROUP?.trim() || "le groupe scout";

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

  // RGPD-09 / sécurité — cette adresse devient un destinataire d'envoi réel.
  // On refuse explicitement plutôt que d'enregistrer une valeur inexploitable :
  // un email silencieusement ignoré laisserait le chef croire le propriétaire
  // informé alors qu'aucun message n'est parti.
  const ownerEmailParsed = parseOwnerEmail(str(fd, "ownerEmail"));
  if (!ownerEmailParsed.ok) return { error: ownerEmailParsed.error };
  const ownerEmail = ownerEmailParsed.value;

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
          ownerEmail,
          // RGPD-09 — jeton posé dès la création : c'est lui qui rend le lien
          // public utilisable. Le statut reste PENDING tant que le propriétaire
          // n'a pas répondu, donc le contact reste invisible dans l'app.
          ownerConsentToken: newOwnerConsentToken(),
          ownerConsentRequestedAt: new Date(),
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

  // RGPD-09 — le contact d'un tiers vient d'être enregistré : on l'en informe
  // et on lui demande son accord. L'envoi est hors transaction, à dessein — un
  // email est un effet de bord irréversible, il n'a rien à faire dans un
  // `withAudit()`, et son échec ne doit pas annuler la création du lieu.
  if (place.ownerEmail) {
    await sendOwnerConsentRequest({
      to: place.ownerEmail,
      ownerName: place.ownerName,
      placeName: place.name,
      groupName: GROUP_NAME,
      token: place.ownerConsentToken!,
    });
  }

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

  // RGPD-09 / sécurité — cette adresse devient un destinataire d'envoi réel.
  // On refuse explicitement plutôt que d'enregistrer une valeur inexploitable :
  // un email silencieusement ignoré laisserait le chef croire le propriétaire
  // informé alors qu'aucun message n'est parti.
  const ownerEmailParsed = parseOwnerEmail(str(fd, "ownerEmail"));
  if (!ownerEmailParsed.ok) return { error: ownerEmailParsed.error };
  const ownerEmail = ownerEmailParsed.value;

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
          ownerEmail,
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

/**
 * RGPD-09 — efface le contact du propriétaire d'un lieu, à SA demande.
 *
 * Le propriétaire n'est pas utilisateur de l'application : il ne peut ni se
 * connecter pour exercer ses droits, ni voir ce qui est stocké sur lui. Le
 * chemin d'effacement passe donc nécessairement par un tiers interne, d'où
 * cette action — et d'où la trace d'audit, seule preuve que la demande a été
 * honorée si elle est contestée plus tard.
 *
 * Le lieu lui-même est conservé : ses caractéristiques (adresse, capacité,
 * équipements, avis) ne sont pas des données personnelles et gardent leur
 * utilité pour le groupe. Seules les trois colonnes de contact sont vidées.
 */
export async function erasePlaceOwnerContact(placeId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "place.owner_contact.erase")) return { error: "Permission refusée." };

  const place = await db.campPlace.findUnique({
    where: { id: placeId },
    select: { id: true, name: true, ownerName: true, ownerPhone: true, ownerEmail: true },
  });
  if (!place) return { error: "Lieu introuvable." };
  if (!place.ownerName && !place.ownerPhone && !place.ownerEmail) {
    return { error: "Ce lieu ne porte aucun contact de propriétaire." };
  }

  await withAudit(
    (tx) =>
      tx.campPlace.update({
        where: { id: placeId },
        data: { ownerName: null, ownerPhone: null, ownerEmail: null },
      }),
    {
      action: "PLACE_OWNER_CONTACT_ERASED",
      userId: user.id,
      // On journalise QUE des champs présents/absents, jamais les valeurs :
      // recopier le contact dans l'audit reviendrait à ne pas l'avoir effacé.
      metadata: {
        placeId,
        placeName: place.name,
        hadName: place.ownerName !== null,
        hadPhone: place.ownerPhone !== null,
        hadEmail: place.ownerEmail !== null,
      },
    },
  );

  revalidatePath(`/lieux/${placeId}`);
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

  // US-L07 — l'avis peut être rattaché à un camp, ce qui lui donne sa branche
  // et son année. Le camp vient du client : on vérifie qu'il existe et qu'il
  // s'est bien tenu ici, sinon le filtre afficherait des rattachements faux.
  if (eventId) {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { campPlaceId: true },
    });
    if (!event || event.campPlaceId !== placeId) {
      return { error: "Camp invalide pour ce lieu." };
    }
  }

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

  // Cette action écrit sur l'ÉVÉNEMENT (`campPlaceId`) : même périmètre d'unité
  // que `updateEvent` (D-024), sinon elle offrirait un second chemin pour
  // modifier l'événement d'une autre branche.
  const outOfScope = await refuseIfEventOutOfScope(user, "event.manage", eventId);
  if (outOfScope) return outOfScope;

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
