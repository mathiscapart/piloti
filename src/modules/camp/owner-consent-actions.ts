"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { newOwnerConsentToken, sendOwnerConsentRequest } from "./owner-consent";

// RGPD-09 — actions liées à la validation par le propriétaire d'un lieu.
//
// ATTENTION : `submitOwnerDecision` est délibérément SANS authentification.
// C'est la seule façon de laisser un tiers non-utilisateur exercer ses droits :
// il n'a pas de compte et ne peut pas en avoir. L'autorisation repose donc
// entièrement sur le jeton, non devinable et propre à un lieu. Ce fichier est
// isolé pour que cette frontière soit visible d'un coup d'œil — ne pas y
// ajouter d'action qui suppose une session.

const GROUP_NAME = process.env.ORG_GROUP?.trim() || "le groupe scout";

/** Ce que la page publique montre au propriétaire : ses données, rien d'autre. */
export interface OwnerConsentView {
  placeName: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  status: string;
  decidedAt: Date | null;
}

/**
 * Lit le dossier d'un propriétaire à partir de son jeton.
 * `null` si le jeton est inconnu — on ne distingue jamais « jeton invalide » de
 * « lieu inexistant » : ce serait un oracle permettant de sonder les jetons.
 */
export async function getOwnerConsentByToken(
  token: string,
): Promise<OwnerConsentView | null> {
  if (!token || token.length < 20) return null;
  const place = await db.campPlace.findUnique({
    where: { ownerConsentToken: token },
    select: {
      name: true,
      ownerName: true,
      ownerPhone: true,
      ownerEmail: true,
      ownerConsentStatus: true,
      ownerConsentDecidedAt: true,
    },
  });
  if (!place) return null;
  return {
    placeName: place.name,
    ownerName: place.ownerName,
    ownerPhone: place.ownerPhone,
    ownerEmail: place.ownerEmail,
    status: place.ownerConsentStatus,
    decidedAt: place.ownerConsentDecidedAt,
  };
}

/**
 * Le propriétaire accepte, ou refuse et demande l'effacement.
 *
 * En cas de refus, les trois champs de contact sont vidés DANS LA MÊME
 * transaction que l'enregistrement de la décision : un refus enregistré sans
 * effacement effectif serait une promesse non tenue, et l'inverse une donnée
 * effacée sans trace de pourquoi.
 *
 * Le jeton est consommé (`null`) dans les deux cas : il n'a plus d'objet une
 * fois la décision prise, et le laisser vivant offrirait une URL permanente
 * exposant des données personnelles.
 */
export async function submitOwnerDecision(
  token: string,
  decision: "GRANTED" | "REFUSED",
): Promise<ActionResult> {
  if (!token || token.length < 20) return { error: "Lien invalide ou expiré." };

  const place = await db.campPlace.findUnique({
    where: { ownerConsentToken: token },
    select: { id: true, name: true, createdById: true, ownerConsentStatus: true },
  });
  if (!place) return { error: "Lien invalide ou expiré." };
  if (place.ownerConsentStatus !== "PENDING") {
    return { error: "Votre choix a déjà été enregistré." };
  }

  const erased = decision === "REFUSED";
  const data = {
    ownerConsentStatus: decision,
    ownerConsentDecidedAt: new Date(),
    ownerConsentToken: null,
    ...(erased ? { ownerName: null, ownerPhone: null, ownerEmail: null } : {}),
  };

  // LIMITE CONNUE — `AuditLog.userId` est obligatoire et pointe vers un `User`.
  // L'auteur réel de cette décision est le propriétaire, qui n'est pas
  // utilisateur : on ne peut donc pas l'y inscrire. On attribue l'entrée au
  // chef créateur du lieu — le responsable interne de cette fiche — et
  // `metadata.actor` dit la vérité sur qui a décidé. Le correctif propre serait
  // un `userId` nullable ou un acteur système ; c'est un changement du socle
  // d'audit, hors périmètre de ce lot (cf. D-032).
  if (place.createdById) {
    await withAudit((tx) => tx.campPlace.update({ where: { id: place.id }, data }), {
      action: "PLACE_OWNER_CONTACT_ERASED",
      userId: place.createdById,
      metadata: {
        placeId: place.id,
        placeName: place.name,
        actor: "OWNER_VIA_TOKEN",
        decision,
        erased,
      },
    });
  } else {
    // Lieu dont le créateur a été supprimé : la décision du propriétaire prime
    // sur la traçabilité interne — on n'allait pas refuser un effacement RGPD
    // au motif qu'on ne sait pas à qui imputer la ligne d'audit.
    await db.campPlace.update({ where: { id: place.id }, data });
  }

  revalidatePath(`/lieux/${place.id}`);
  revalidatePath("/lieux");
  return { error: null };
}

/**
 * Relance : renvoie la demande de validation au propriétaire.
 *
 * Authentifiée, celle-ci. Sert aux lieux créés avant RGPD-09 (dont le statut
 * est `PENDING` sans qu'aucun email n'ait jamais été envoyé) et aux cas où le
 * message s'est perdu. Un nouveau jeton est émis à chaque envoi : l'ancien lien,
 * s'il traînait dans une boîte mail, cesse de fonctionner.
 */
export async function resendOwnerConsentRequest(placeId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "place.owner_contact.erase")) return { error: "Permission refusée." };

  const place = await db.campPlace.findUnique({
    where: { id: placeId },
    select: { id: true, name: true, ownerName: true, ownerEmail: true, ownerConsentStatus: true },
  });
  if (!place) return { error: "Lieu introuvable." };
  if (!place.ownerEmail) {
    return { error: "Ce lieu n'a pas d'email de propriétaire — informez-le par un autre moyen." };
  }
  if (place.ownerConsentStatus === "GRANTED") {
    return { error: "Le propriétaire a déjà donné son accord." };
  }

  const token = newOwnerConsentToken();
  await db.campPlace.update({
    where: { id: placeId },
    data: {
      ownerConsentToken: token,
      ownerConsentRequestedAt: new Date(),
      ownerConsentStatus: "PENDING",
    },
  });

  await sendOwnerConsentRequest({
    to: place.ownerEmail,
    ownerName: place.ownerName,
    placeName: place.name,
    groupName: GROUP_NAME,
    token,
  });

  revalidatePath(`/lieux/${placeId}`);
  return { error: null };
}
