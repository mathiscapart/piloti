// SAFE-01 / RGPD-02 — source unique de vérité pour tout raisonnement sur l'âge.
// Avant ce module, le calcul d'âge était dupliqué entre le formulaire
// d'inscription (client) et sa Server Action, avec un seuil unique de 15 ans
// qui ne servait qu'au consentement parental. La protection des mineurs dans la
// messagerie (SAFE-01) impose de distinguer plusieurs seuils : on les centralise
// ici pour qu'aucun appelant ne redéfinisse sa propre règle.

import { z } from "zod";

// SAFE-01 — bornes de plausibilité. L'âge est déclaratif, donc invérifiable en
// soi, mais rien n'obligeait la date à être crédible : une saisie à quelques
// mois passait sans broncher, et surtout « 1900 » suffisait à un jeune pour se
// déclarer centenaire — donc majeur — et débloquer la messagerie privée dès
// l'inscription. 5 ans laisse une marge sous les Farfadets (6 ans).
export const MIN_PLAUSIBLE_AGE = 5;
export const MAX_PLAUSIBLE_AGE = 110;

// Bornes de validation de la date de naissance, partagées par les quatre
// chemins de création (register, setup, createChildAccount, seed) et par la
// correction admin (setUserBirthDate) : une seule définition des bornes
// valides, donc aucun chemin ne peut poser une date que les autres refusent.
// Les deux contrôles sont des `refine`, donc évalués à la validation. Le
// `.max(new Date())` précédent figeait « maintenant » au chargement du module
// et dérivait sur un serveur qui tourne des semaines.
export const birthDateSchema = z.coerce
  .date("Date de naissance invalide.")
  .refine(
    (d) => d <= new Date(),
    "La date de naissance ne peut pas être dans le futur.",
  )
  .refine((d) => {
    const age = computeAge(d);
    return age !== null && age >= MIN_PLAUSIBLE_AGE && age <= MAX_PLAUSIBLE_AGE;
  }, `Date de naissance invraisemblable (âge attendu entre ${MIN_PLAUSIBLE_AGE} et ${MAX_PLAUSIBLE_AGE} ans).`);

// US-CM-04 — âge minimum pour s'inscrire SOI-MÊME. En dessous, aucune
// auto-inscription possible : la fiche du jeune est créée par un parent ou un
// chef (US-CM-03) et c'est son responsable légal qui agit pour lui (US-CM-01).
// Sans ce refus, l'attestation parentale reste auto-déclarée par l'enfant
// lui-même, et tout le mécanisme de consentement se contourne d'une case cochée.
export const MIN_LOGIN_AGE = 15;

// RGPD-02 (amendé le 2026-08-08, US-CM-04) — en-dessous de ce seuil,
// l'inscription requiert l'attestation d'un responsable légal en plus du
// consentement de la personne elle-même. Le seuil est passé de 15 à 18 ans :
// TOUT mineur inscrit requiert désormais cette autorisation, et non plus les
// seuls moins de 15 ans — qui, depuis US-CM-04, ne s'inscrivent plus du tout.
// Numériquement égal à MAJORITY_AGE, mais conceptuellement distinct : l'un est
// une règle de consentement, l'autre la minorité légale.
export const PARENTAL_CONSENT_AGE = 18;

// SAFE-01 — en-dessous de ce seuil, aucun message privé n'est possible, ni émis
// ni reçu. Au-dessus, les échanges privés restent limités aux chefs de l'unité
// du jeune (et à ses responsables légaux via FamilyLink).
export const DIRECT_MESSAGE_MIN_AGE = 15;

// SAFE-01 — majorité légale : sépare les encadrants adultes des jeunes. Ne pas
// confondre avec PARENTAL_CONSENT_AGE (règle de consentement) ni avec
// MIN_LOGIN_AGE (droit de s'inscrire seul), même si les valeurs coïncident.
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
 * US-CM-04 — cette personne peut-elle s'inscrire elle-même à l'application ?
 * Date inconnue : `false`. Un compte sans date de naissance ne doit jamais
 * franchir l'inscription, sans quoi la règle serait contournable en vidant le
 * champ — même principe que `isAdult`.
 */
export function canSelfRegister(birthDate: Date | string | null | undefined): boolean {
  const age = computeAge(birthDate);
  return age !== null && age >= MIN_LOGIN_AGE;
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
