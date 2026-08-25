"use server";

import { revalidatePath } from "next/cache";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import {
  isConsentLinkExpired,
  newOwnerConsentToken,
  sendOwnerConsentRequest,
} from "./owner-consent";

// RGPD-09 — actions liées à la validation par le propriétaire d'un lieu.
//
// ATTENTION : `submitOwnerDecision` est délibérément SANS authentification.
// C'est la seule façon de laisser un tiers non-utilisateur exercer ses droits :
// il n'a pas de compte et ne peut pas en avoir. L'autorisation repose donc
// entièrement sur le jeton, non devinable et propre à un lieu. Ce fichier est
// isolé pour que cette frontière soit visible d'un coup d'œil — ne pas y
// ajouter d'action qui suppose une session.

const GROUP_NAME = process.env.ORG_GROUP?.trim() || "le groupe scout";

/**
 * Le propriétaire accepte, ou refuse et demande l'effacement.
 *
 * En cas de refus, les trois champs de contact sont vidés DANS LA MÊME
 * transaction que l'enregistrement de la décision : un refus enregistré sans
 * effacement effectif serait une promesse non tenue, et l'inverse une donnée
 * effacée sans trace de pourquoi.
 *
 * Le jeton SURVIT à la décision, mais la page cesse d'afficher les données.
 *
 * Le réflexe était de le consommer (`null`) pour ne pas laisser vivre une URL
 * exposant des données personnelles. Sauf qu'une Server Action déclenche
 * toujours un re-rendu de la route courante : le propriétaire voyait donc
 * « lien expiré » dans la seconde suivant son clic — un message d'échec juste
 * après une action réussie. Trouvé en capturant les écrans, pas en relisant.
 *
 * On garde donc le jeton et on retire l'exposition : après décision, la page
 * n'affiche plus ni les coordonnées ni le nom du lieu, seulement l'état et sa
 * date. Le lien devient une preuve consultable, plus un canal d'accès.
 */
export async function submitOwnerDecision(
  token: string,
  decision: "GRANTED" | "REFUSED",
): Promise<ActionResult> {
  if (!token || token.length < 20) return { error: "Lien invalide ou expiré." };

  const place = await db.campPlace.findUnique({
    where: { ownerConsentToken: token },
    select: {
      id: true,
      name: true,
      createdById: true,
      ownerConsentStatus: true,
      ownerConsentRequestedAt: true,
    },
  });
  if (!place) return { error: "Lien invalide ou expiré." };
  if (place.ownerConsentStatus !== "PENDING") {
    return { error: "Votre choix a déjà été enregistré." };
  }
  // Le contrôle vit AUSSI ici, et pas seulement à l'affichage : cette action est
  // appelable directement, sans passer par la page. Une expiration qui ne
  // masquerait que le rendu se contournerait d'une requête.
  if (isConsentLinkExpired(place.ownerConsentRequestedAt)) {
    return { error: "Ce lien a expiré. Demandez au groupe de vous en envoyer un nouveau." };
  }

  const erased = decision === "REFUSED";
  const data = {
    ownerConsentStatus: decision,
    ownerConsentDecidedAt: new Date(),
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
  // Gardé par le droit de VOIR le contact : on ne sollicite pas une personne
  // dont on n'a pas à connaître les coordonnées. Les deux droits couvrent les
  // mêmes rôles aujourd'hui, mais celui-ci reste le bon si l'un des deux évolue.
  if (!can(user, "place.owner_contact.view")) return { error: "Permission refusée." };

  const place = await db.campPlace.findUnique({
    where: { id: placeId },
    select: {
      id: true,
      name: true,
      ownerName: true,
      ownerEmail: true,
      ownerConsentStatus: true,
      ownerConsentRequestedAt: true,
    },
  });
  if (!place) return { error: "Lieu introuvable." };
  if (!place.ownerEmail) {
    return { error: "Ce lieu n'a pas d'email de propriétaire — informez-le par un autre moyen." };
  }
  if (place.ownerConsentStatus === "GRANTED") {
    return { error: "Le propriétaire a déjà donné son accord." };
  }

  // SÉCURITÉ — anti-harcèlement. Sans ce délai, le bouton de relance permet à
  // un chef d'inonder une boîte mail d'un simple clic répété, et l'application
  // en porterait la réputation d'expéditeur. Le destinataire n'est pas
  // utilisateur : il n'a aucun moyen de se désabonner de nos envois.
  const RELANCE_DELAI_MS = 15 * 60 * 1000;
  const derniere = place.ownerConsentRequestedAt?.getTime() ?? 0;
  if (Date.now() - derniere < RELANCE_DELAI_MS) {
    return {
      error: "Une demande vient d'être envoyée. Merci de patienter avant de relancer.",
    };
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
      token,
  });

  revalidatePath(`/lieux/${placeId}`);
  return { error: null };
}
