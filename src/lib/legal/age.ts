// SAFE-01 / RGPD-02 — source unique de vérité pour tout raisonnement sur l'âge.
// Avant ce module, le calcul d'âge était dupliqué entre le formulaire
// d'inscription (client) et sa Server Action, avec un seuil unique de 15 ans
// qui ne servait qu'au consentement parental. La protection des mineurs dans la
// messagerie (SAFE-01) impose de distinguer plusieurs seuils : on les centralise
// ici pour qu'aucun appelant ne redéfinisse sa propre règle.

import { z } from "zod";

// Bornes de validation de la date de naissance, partagées par l'inscription
// (register/actions.ts) et par la complétion de profil a posteriori
// (completer-profil/actions.ts) : une seule définition des bornes valides.
export const birthDateSchema = z.coerce
  .date("Date de naissance invalide.")
  .min(new Date("1900-01-01"), "Date de naissance invalide.")
  .max(new Date(), "La date de naissance ne peut pas être dans le futur.");

// RGPD-02 — en-dessous de ce seuil, l'inscription requiert l'attestation d'un
// responsable légal en plus du consentement de la personne elle-même.
export const PARENTAL_CONSENT_AGE = 15;

// SAFE-01 — en-dessous de ce seuil, aucun message privé n'est possible, ni émis
// ni reçu. Au-dessus, les échanges privés restent limités aux chefs de l'unité
// du jeune (et à ses responsables légaux via FamilyLink).
export const DIRECT_MESSAGE_MIN_AGE = 15;

// SAFE-01 — majorité légale : sépare les encadrants adultes des jeunes. Ne pas
// confondre avec PARENTAL_CONSENT_AGE, qui est un seuil RGPD, pas la minorité.
export const MAJORITY_AGE = 18;

/**
 * Âge révolu, ou `null` si la date est absente ou invalide. Les appelants
 * décident eux-mêmes du sens à donner à `null` — voir les prédicats ci-dessous,
 * qui n'accordent jamais un droit sur une date inconnue.
 */
export function computeAge(birthDate: Date | string | null | undefined): number | null {
  if (birthDate === null || birthDate === undefined || birthDate === "") return null;
  const dob = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const birthdayPassedThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!birthdayPassedThisYear) age -= 1;
  return age;
}

/**
 * RGPD-02 — l'inscription requiert-elle une attestation parentale ?
 * Date inconnue : `false`, car le formulaire n'a pas à réclamer une attestation
 * tant que l'utilisateur n'a rien saisi ; la validation Zod exige de toute façon
 * une date valide avant que la question ne se pose.
 */
export function requiresParentalConsent(birthDate: Date | string | null | undefined): boolean {
  const age = computeAge(birthDate);
  return age !== null && age < PARENTAL_CONSENT_AGE;
}

/**
 * SAFE-01 — l'utilisateur est-il un adulte au sens de la protection des mineurs ?
 * Date inconnue : `false`. Un compte sans date de naissance n'est jamais traité
 * comme adulte, faute de quoi la règle serait contournable en vidant le champ.
 */
export function isAdult(birthDate: Date | string | null | undefined): boolean {
  const age = computeAge(birthDate);
  return age !== null && age >= MAJORITY_AGE;
}

/**
 * SAFE-01 — l'utilisateur est-il un mineur au sens de la protection de l'enfance ?
 * Date inconnue : `true`. C'est le pendant fail-safe de `isAdult` : dans le doute
 * on protège, quitte à demander à l'intéressé de compléter son profil.
 */
export function isMinor(birthDate: Date | string | null | undefined): boolean {
  return !isAdult(birthDate);
}

/**
 * SAFE-01 — l'utilisateur a-t-il l'âge d'utiliser la messagerie privée ?
 * Date inconnue : `false`. Aucun droit n'est accordé sur une date manquante.
 */
export function canUseDirectMessages(birthDate: Date | string | null | undefined): boolean {
  const age = computeAge(birthDate);
  return age !== null && age >= DIRECT_MESSAGE_MIN_AGE;
}
