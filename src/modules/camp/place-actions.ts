"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  nextOwnerConsent,
  OWNER_CONSENT_REQUEST_DEFERRED,
  OWNER_CONTACT_CHANGED,
  type OwnerContact,
  OwnerContactChangedError,
  ownerContactUnchanged,
  ownerContactVersion,
  type OwnerConsentReset,
  ownerConsentRequestTooSoon,
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

// #97 — colonnes à écrire quand l'accord du propriétaire retombe en attente.
// Un nouveau jeton neutralise l'ancien lien ; sans contact, plus aucun lien.
// `keepLink` (#137) : l'envoi est différé et l'email n'a pas changé. Le lien
// déjà reçu reste valable, faute de quoi le propriétaire n'en aurait plus aucun
// d'utilisable jusqu'à la relance. Même destinataire : il n'y voit rien qui ne
// le concerne, et la page lit le contact à jour à partir du jeton.
function consentResetData(reset: OwnerConsentReset, keepLink = false) {
  if (keepLink) {
    return { ownerConsentStatus: reset.status, ownerConsentDecidedAt: null };
  }
  const issued = reset.token === "NEW";
  return {
    ownerConsentStatus: reset.status,
    ownerConsentToken: issued ? newOwnerConsentToken() : null,
    ownerConsentRequestedAt: issued ? new Date() : null,
    ownerConsentDecidedAt: null,
  };
}

function collectPhotos(fd: FormData): string[] {
  return fd
    .getAll("photo")
    .map(String)
    .filter((u) => u.startsWith("/uploads/"))
    .slice(0, 8);
}

// #136 — sort du contact dans le formulaire de modification. `keep` : le
// contact en attente n'a pas été renvoyé au navigateur, ses colonnes ne sont
// pas touchées. `replace` : les champs soumis font foi (#97). Le choix est
// explicite : des champs vides ne valent jamais « conserver ».
const ownerContactModeSchema = z.enum(["keep", "replace"]);

/** #151 — une transaction annulée faute de contact inchangé rend `null`. */
function nullIfOwnerContactChanged(e: unknown): null {
  if (e instanceof OwnerContactChangedError) return null;
  throw e;
}

/** `notice` : enregistré, mais la demande au propriétaire est différée (#137). */
type PlaceActionResult = ActionResult & { notice?: string };

// US-L04 — créer une fiche lieu (géocodage best-effort de l'adresse).
export async function createPlace(
  fd: FormData,
): Promise<PlaceActionResult & { id?: string }> {
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

  const { place, deferred } = await withAudit(
    async (tx) => {
      // #137 — lu avant de poser le jeton, dans la même transaction.
      const deferred = ownerEmail ? await ownerConsentRequestTooSoon(tx, ownerEmail) : false;
      const place = await tx.campPlace.create({
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
      });
      return { place, deferred };
    },
    ({ place, deferred }) => ({
      action: "PLACE_CREATED",
      userId: user.id,
      metadata: { placeId: place.id, name, ownerConsentRequestDeferred: deferred },
    }),
  );

  // RGPD-09 — le contact d'un tiers vient d'être enregistré : on l'en informe
  // et on lui demande son accord. L'envoi est hors transaction, à dessein — un
  // email est un effet de bord irréversible, il n'a rien à faire dans un
  // `withAudit()`, et son échec ne doit pas annuler la création du lieu.
  // Différé (#137) : le jeton est posé, le chef relancera depuis la fiche.
  if (place.ownerEmail && !deferred) {
    await sendOwnerConsentRequest({
      to: place.ownerEmail,
      token: place.ownerConsentToken!,
    });
  }

  revalidatePath("/lieux");
  return deferred
    ? { error: null, id: place.id, notice: OWNER_CONSENT_REQUEST_DEFERRED }
    : { error: null, id: place.id };
}

// US-L05 — modifier un lieu (chef créateur OU admin).
export async function updatePlace(
  placeId: string,
  fd: FormData,
): Promise<PlaceActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "place.manage")) return { error: "Permission refusée." };

  const contactMode = ownerContactModeSchema.safeParse(fd.get("ownerContact"));
  if (!contactMode.success) return { error: "Formulaire invalide." };

  const place = await db.campPlace.findUnique({
    where: { id: placeId },
    select: {
      id: true,
      createdById: true,
      address: true,
      latitude: true,
      longitude: true,
      ownerName: true,
      ownerPhone: true,
      ownerEmail: true,
      ownerConsentStatus: true,
      ownerConsentDecidedAt: true,
    },
  });
  if (!place) return { error: "Lieu introuvable." };

  const isAdmin = effectiveRoles(user).includes("ADMIN");
  if (!isAdmin && place.createdById !== user.id) {
    return { error: "Seul le créateur du lieu (ou un admin) peut le modifier." };
  }

  const name = str(fd, "name");
  if (!name) return { error: "Le nom est requis." };

  // #136 — « conserver » : aucune colonne de contact n'est écrite, donc ni le
  // statut ni le jeton ne bougent. Les champs du formulaire sont ignorés.
  let contact: OwnerContact | null = null;
  let consentReset: OwnerConsentReset | null = null;
  if (contactMode.data === "replace") {
    // #151 — le formulaire a-t-il été ouvert sur ce contact ? Sinon il le
    // réécrirait tel qu'il l'affichait : un contact effacé ou refusé depuis
    // reviendrait, et son titulaire recevrait une nouvelle demande.
    const seen = fd.get("ownerContactVersion");
    if (typeof seen !== "string") return { error: "Formulaire invalide." };
    if (seen !== ownerContactVersion(place)) return { error: OWNER_CONTACT_CHANGED };

    // RGPD-09 / sécurité — cette adresse devient un destinataire d'envoi réel.
    // On refuse explicitement plutôt que d'enregistrer une valeur inexploitable :
    // un email silencieusement ignoré laisserait le chef croire le propriétaire
    // informé alors qu'aucun message n'est parti.
    const ownerEmailParsed = parseOwnerEmail(str(fd, "ownerEmail"));
    if (!ownerEmailParsed.ok) return { error: ownerEmailParsed.error };
    contact = {
      name: str(fd, "ownerName"),
      phone: str(fd, "ownerPhone"),
      email: ownerEmailParsed.value,
    };

    // #97 — l'accord du propriétaire ne survit pas à un changement de personne.
    consentReset = nextOwnerConsent(
      place.ownerConsentStatus,
      { name: place.ownerName, phone: place.ownerPhone, email: place.ownerEmail },
      contact,
    );
  }

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

  const outcome = await withAudit(
    async (tx) => {
      // #137 — lu avant de poser le nouveau jeton, dans la même transaction.
      const deferred =
        consentReset?.token === "NEW" && contact?.email
          ? await ownerConsentRequestTooSoon(tx, contact.email)
          : false;
      // #151 — en « remplacer », l'écriture n'a lieu que si le contact est
      // encore celui lu plus haut : un effacement ou un refus survenu entre
      // les deux annule tout, l'audit compris.
      const { count } = await tx.campPlace.updateMany({
        where: { id: placeId, ...(contact ? ownerContactUnchanged(place) : {}) },
        data: {
          name,
          address,
          region: str(fd, "region"),
          capacity: parseCapacity(fd),
          latitude,
          longitude,
          equipmentJson: JSON.stringify(collectEquipment(fd)),
          ...(contact
            ? { ownerName: contact.name, ownerPhone: contact.phone, ownerEmail: contact.email }
            : {}),
          notes: str(fd, "notes"),
          photosJson: JSON.stringify(collectPhotos(fd)),
          ...(consentReset
            ? consentResetData(consentReset, deferred && contact?.email === place.ownerEmail)
            : {}),
        },
      });
      if (count === 0) throw new OwnerContactChangedError();
      const row = await tx.campPlace.findUniqueOrThrow({
        where: { id: placeId },
        select: { ownerEmail: true, ownerConsentToken: true },
      });
      // Seconde entrée, même transaction : le retour en attente a sa propre
      // action pour se lire dans le journal sans ouvrir le détail du PLACE_UPDATED.
      // Ni l'ancien ni le nouveau contact n'y sont recopiés : l'audit ne doit
      // pas devenir un second stockage des coordonnées.
      if (consentReset) {
        await tx.auditLog.create({
          data: {
            action: "PLACE_OWNER_CONSENT_RESET",
            userId: user.id,
            metadata: JSON.stringify({
              placeId,
              placeName: name,
              previousStatus: place.ownerConsentStatus,
              reason: consentReset.reason,
              requestDeferred: deferred,
            }),
          },
        });
      }
      return { updated: row, deferred };
    },
    { action: "PLACE_UPDATED", userId: user.id, metadata: { placeId, name } },
  ).catch(nullIfOwnerContactChanged);
  if (!outcome) return { error: OWNER_CONTACT_CHANGED };
  const { updated, deferred } = outcome;

  // RGPD-09 — nouvelle personne, nouvelle demande. Hors transaction, comme à la
  // création : un envoi raté laisse simplement le contact en attente.
  // Différé (#137) : le jeton est posé, le chef relancera depuis la fiche.
  if (consentReset?.token === "NEW" && updated.ownerEmail && !deferred) {
    await sendOwnerConsentRequest({
      to: updated.ownerEmail,
      token: updated.ownerConsentToken!,
    });
  }

  revalidatePath("/lieux");
  revalidatePath(`/lieux/${placeId}`);
  return deferred ? { error: null, notice: OWNER_CONSENT_REQUEST_DEFERRED } : { error: null };
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
    select: {
      id: true,
      name: true,
      ownerName: true,
      ownerPhone: true,
      ownerEmail: true,
      ownerConsentStatus: true,
      ownerConsentDecidedAt: true,
    },
  });
  if (!place) return { error: "Lieu introuvable." };
  // #97 — sans contact, plus d'accord : le statut repasse en attente, sans
  // jeton. Un contact ressaisi plus tard ne peut ainsi hériter d'aucun accord.
  const consentReset = nextOwnerConsent(
    place.ownerConsentStatus,
    { name: place.ownerName, phone: place.ownerPhone, email: place.ownerEmail },
    { name: null, phone: null, email: null },
  );
  if (!consentReset) {
    return { error: "Ce lieu ne porte aucun contact de propriétaire." };
  }

  // #151 — n'efface que le contact lu ci-dessus. S'il a été remplacé entre-temps,
  // le nouveau appartient peut-être à une autre personne, qui n'a rien demandé ;
  // et l'audit décrirait un contact qui n'est plus celui effacé.
  const erased = await withAudit(
    async (tx) => {
      const { count } = await tx.campPlace.updateMany({
        where: { id: placeId, ...ownerContactUnchanged(place) },
        data: {
          ownerName: null,
          ownerPhone: null,
          ownerEmail: null,
          ...consentResetData(consentReset),
        },
      });
      if (count === 0) throw new OwnerContactChangedError();
      return true;
    },
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
        previousStatus: place.ownerConsentStatus,
      },
    },
  ).catch(nullIfOwnerContactChanged);
  if (!erased) return { error: OWNER_CONTACT_CHANGED };

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
