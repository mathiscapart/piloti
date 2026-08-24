import { randomBytes } from "node:crypto";

import { escapeHtml, sendEmail } from "@/lib/email";

// RGPD-09 — demande de validation au propriétaire d'un lieu de camp.
//
// Le propriétaire n'est PAS utilisateur de l'application : il ne peut ni se
// connecter, ni consulter ce qui est stocké sur lui, ni exercer ses droits par
// les chemins habituels. Tout passe donc par un lien public porteur d'un jeton
// — même principe que l'abonnement iCal (`calendarToken`), rendu révocable en
// `bc612e4` : une URL non devinable, sans session, révocable en la remplaçant.
//
// La base légale du traitement reste l'intérêt légitime (organiser un camp,
// cf. politique de confidentialité). Cette validation est une garantie INTERNE
// qui vient s'y ajouter : tant qu'elle manque, le contact reste stocké mais
// invisible dans l'application. Une boîte mail morte ne détruit donc rien.

/** Jeton d'URL publique : 32 octets, base64url — non devinable, non séquentiel. */
export function newOwnerConsentToken(): string {
  return randomBytes(32).toString("base64url");
}

/** URL publique de la page de validation, à mettre dans l'email. */
export function ownerConsentUrl(token: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/proprietaire/${token}`;
}

interface RequestInput {
  to: string;
  ownerName: string | null;
  placeName: string;
  groupName: string;
  token: string;
}

/**
 * Envoie la demande de validation. Ne lève jamais : `sendEmail` dégrade
 * proprement quand Resend n'est pas configuré (dev local, prod sans domaine
 * vérifié). Un envoi raté ne doit pas faire échouer la création du lieu —
 * le contact reste alors simplement en attente, donc invisible, et le chef
 * dispose d'un bouton de relance.
 */
export async function sendOwnerConsentRequest({
  to,
  ownerName,
  placeName,
  groupName,
  token,
}: RequestInput): Promise<void> {
  const url = ownerConsentUrl(token);
  const bonjour = ownerName ? `Bonjour ${escapeHtml(ownerName)},` : "Bonjour,";

  const html = `
    <p>${bonjour}</p>
    <p>
      Le groupe scout <strong>${escapeHtml(groupName)}</strong> utilise une
      application interne pour organiser ses camps. Vos coordonnées y sont
      enregistrées comme contact du lieu
      « <strong>${escapeHtml(placeName)}</strong> ».
    </p>
    <p>
      Nous vous en informons et vous demandons votre accord avant de les rendre
      utilisables par les responsables du groupe. Tant que vous n'avez pas
      répondu, elles restent <strong>invisibles</strong> dans l'application.
    </p>
    <p><a href="${url}">Voir ce qui est enregistré et répondre</a></p>
    <p>
      Cette page vous montre exactement les données concernées. Vous pouvez les
      accepter, ou demander leur effacement immédiat — sans créer de compte.
    </p>
    <p style="color:#666;font-size:12px">
      Si vous n'êtes pas concerné par ce message, ignorez-le : sans réponse de
      votre part, ces coordonnées ne seront jamais affichées.
    </p>
  `;

  await sendEmail({
    to,
    subject: `Vos coordonnées pour le lieu « ${placeName} »`,
    html,
  });
}
