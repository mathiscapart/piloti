import { createHmac, randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { escapeHtml, sendEmail } from "@/lib/email";
import { db } from "@/lib/db";

import { parseOwnerEmail } from "./types";

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

/**
 * Nettoie un texte destiné à un en-tête d'email.
 *
 * SÉCURITÉ — un sujet est un en-tête : les retours à la ligne y sont
 * structurants. Le nom d'un lieu est saisi librement ; l'API du fournisseur
 * sérialise en JSON, ce qui neutralise l'injection classique, mais on ne fait
 * pas reposer une propriété de sécurité sur le comportement d'un tiers.
 */
function headerSafe(value: string, max = 120): string {
  // Les caractères de contrôle sont structurants dans un en-tête. On les
  // neutralise par leur CODE plutôt que par une classe regex : les
  // échappements se prêtent aux fautes silencieuses, un test numérique non.
  const cleaned = Array.from(value, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f ? " " : ch;
  }).join("");
  return cleaned.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Durée de validité d'un lien de validation, en jours.
 *
 * SÉCURITÉ — l'entropie du jeton (256 bits) le rend inattaquable ; c'est la
 * DURÉE D'EXPOSITION qui constitue le risque réel. Un lien éternel finit par
 * fuiter autrement que par la cryptographie : email transféré, boîte revendue
 * avec un nom de domaine, journal d'accès conservé, historique de navigateur
 * d'un poste partagé. Même raison qui fait expirer un lien de réinitialisation
 * de mot de passe alors que son entropie est identique.
 *
 * 90 jours : assez large pour un propriétaire qui relève peu sa boîte, assez
 * court pour qu'un lien oublié cesse d'être une porte ouverte. Passé ce délai,
 * RIEN n'est détruit — seul le lien cesse de fonctionner, et le chef en émet un
 * nouveau d'un clic. C'est le lien qui expire, jamais la fiche.
 */
export const OWNER_CONSENT_LINK_TTL_DAYS = 90;

/** Le lien émis à cette date est-il périmé ? Une date absente vaut périmée. */
export function isConsentLinkExpired(requestedAt: Date | null | undefined): boolean {
  if (!requestedAt) return true;
  const ageMs = Date.now() - requestedAt.getTime();
  return ageMs > OWNER_CONSENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Délai minimal entre deux demandes vers une même adresse, en minutes.
 *
 * SÉCURITÉ — anti-harcèlement. Le destinataire n'est pas utilisateur : il n'a
 * aucun moyen de se désabonner de nos envois, et l'application en porterait la
 * réputation d'expéditeur. L'auto-limitation est sa seule protection.
 */
export const OWNER_CONSENT_REQUEST_INTERVAL_MINUTES = 15;

/** Une demande déjà émise : l'adresse d'un lieu et la date de son dernier jeton. */
export interface OwnerConsentRequestTrace {
  email: string | null;
  requestedAt: Date | null;
}

/**
 * #137 — une demande vers `to` serait-elle trop rapprochée de la précédente ?
 *
 * La règle vaut par ADRESSE, tous lieux confondus : par lieu, créer des lieux
 * en série ou alterner deux téléphones sur une fiche la contournerait. Création,
 * modification et relance passent toutes par elle.
 */
export function isOwnerConsentRequestTooSoon(
  to: string,
  previous: OwnerConsentRequestTrace[],
  now: number = Date.now(),
): boolean {
  const target = to.toLowerCase();
  const since = now - OWNER_CONSENT_REQUEST_INTERVAL_MINUTES * 60 * 1000;
  return previous.some(
    (p) =>
      p.email?.toLowerCase() === target &&
      p.requestedAt !== null &&
      p.requestedAt.getTime() > since,
  );
}

/**
 * Lit les demandes récentes et applique la règle. À appeler DANS la transaction
 * qui pose le nouveau jeton, et avant de le poser : sinon le lieu se trouverait
 * lui-même, et deux enregistrements simultanés passeraient tous les deux.
 */
export async function ownerConsentRequestTooSoon(
  tx: Pick<Prisma.TransactionClient, "campPlace">,
  to: string,
): Promise<boolean> {
  const now = Date.now();
  const recent = await tx.campPlace.findMany({
    where: {
      ownerEmail: { not: null },
      ownerConsentRequestedAt: {
        gt: new Date(now - OWNER_CONSENT_REQUEST_INTERVAL_MINUTES * 60 * 1000),
      },
    },
    select: { ownerEmail: true, ownerConsentRequestedAt: true },
  });
  return isOwnerConsentRequestTooSoon(
    to,
    recent.map((r) => ({ email: r.ownerEmail, requestedAt: r.ownerConsentRequestedAt })),
    now,
  );
}

/** Message affiché au chef quand l'envoi est différé. */
export const OWNER_CONSENT_REQUEST_DEFERRED =
  "Une demande a déjà été envoyée récemment à cette adresse. Vous pourrez la relancer depuis la fiche dans quelques minutes.";

/** Les trois coordonnées du propriétaire, telles que stockées sur la fiche. */
export interface OwnerContact {
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** Remise en attente de l'accord, et ce qu'il advient du jeton. */
export interface OwnerConsentReset {
  status: "PENDING";
  /** `NEW` : un nouveau lien est émis ; `NONE` : plus aucun contact, plus aucun lien. */
  token: "NEW" | "NONE";
  reason: "CONTACT_CHANGED" | "CONTACT_ERASED";
}

function isEmptyContact(c: OwnerContact): boolean {
  return !c.name && !c.phone && !c.email;
}

/**
 * #97 — nouveau statut d'accord quand le chef modifie ou efface le contact.
 * `null` : rien ne change.
 *
 * L'accord vaut pour une PERSONNE, pas pour une fiche. Il tombe dès que
 * l'email ou le téléphone change : ce sont eux qui désignent la personne
 * jointe. Le nom seul ne la désigne pas — le corriger (faute de frappe) ne
 * redemande rien.
 *
 * Le jeton est renouvelé même si l'accord était déjà en attente : l'ancien lien
 * montrerait sinon le NOUVEAU contact à l'ANCIEN destinataire.
 *
 * Après un refus, les champs ont été vidés : toute saisie est un nouveau
 * contact, qu'on ne peut pas comparer à celui qui a refusé sans en avoir gardé
 * une empreinte — ce qu'on s'interdit (D-032, amendement #97).
 */
export function nextOwnerConsent(
  status: string,
  before: OwnerContact,
  after: OwnerContact,
): OwnerConsentReset | null {
  if (isEmptyContact(after)) {
    return isEmptyContact(before)
      ? null
      : { status: "PENDING", token: "NONE", reason: "CONTACT_ERASED" };
  }
  const samePerson =
    !isEmptyContact(before) && before.email === after.email && before.phone === after.phone;
  if (samePerson && status !== "REFUSED") return null;
  return { status: "PENDING", token: "NEW", reason: "CONTACT_CHANGED" };
}

/**
 * #151 — état du contact tel qu'un formulaire ou une action l'a lu. Le jeton
 * n'en fait pas partie : une relance ne change pas la personne jointe.
 */
export interface OwnerContactState {
  ownerConsentStatus: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerConsentDecidedAt: Date | null;
}

/** Message affiché quand le contact a changé depuis sa lecture. */
export const OWNER_CONTACT_CHANGED =
  "Le contact du propriétaire a changé entre-temps. Rechargez la page.";

/** Levée dans une transaction pour l'annuler quand le contact a changé. */
export class OwnerContactChangedError extends Error {}

/**
 * #151 — empreinte de l'état du contact, envoyée avec le formulaire de
 * modification et recalculée à l'enregistrement : un formulaire ouvert avant
 * un effacement ou un refus ne peut plus ressusciter le contact.
 *
 * HMAC par la clé du serveur : le contact en attente n'atteint pas le
 * navigateur (#136), pas même sous une forme qu'on pourrait recalculer à partir
 * d'une adresse devinée. L'empreinte n'est jamais stockée (amendement #97).
 */
export function ownerContactFingerprint(state: OwnerContactState, key: string): string {
  return createHmac("sha256", key)
    .update(
      JSON.stringify([
        state.ownerConsentStatus,
        state.ownerName,
        state.ownerPhone,
        state.ownerEmail,
        state.ownerConsentDecidedAt?.toISOString() ?? null,
      ]),
    )
    .digest("base64url");
}

/** Empreinte par la clé de l'instance (celle de better-auth, obligatoire au démarrage). */
export function ownerContactVersion(state: OwnerContactState): string {
  const key = process.env.BETTER_AUTH_SECRET;
  if (!key) throw new Error("BETTER_AUTH_SECRET manquant.");
  return ownerContactFingerprint(state, key);
}

/** Condition Prisma : la ligne porte encore exactement cet état de contact. */
export function ownerContactUnchanged(state: OwnerContactState): OwnerContactState {
  return {
    ownerConsentStatus: state.ownerConsentStatus,
    ownerName: state.ownerName,
    ownerPhone: state.ownerPhone,
    ownerEmail: state.ownerEmail,
    ownerConsentDecidedAt: state.ownerConsentDecidedAt,
  };
}

/** Jeton d'URL publique : 32 octets, base64url — non devinable, non séquentiel. */
export function newOwnerConsentToken(): string {
  return randomBytes(32).toString("base64url");
}

/** URL publique de la page de validation, à mettre dans l'email. */
export function ownerConsentUrl(token: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  // Le jeton est du base64url (`A-Za-z0-9_-`) : rien à échapper. On le vérifie
  // tout de même — une URL construite à partir d'une valeur inattendue finirait
  // dans un `href`, donc dans le navigateur du destinataire.
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error("Jeton de validation malformé.");
  }
  return `${base.replace(/\/+$/, "")}/proprietaire/${token}`;
}

// SÉCURITÉ — cette lecture vit ici, PAS dans `owner-consent-actions.ts`.
// Tout export d'un fichier `"use server"` devient un endpoint réseau appelable
// par quiconque avec des arguments arbitraires. Le jeton de 32 octets rend
// l'énumération irréaliste, mais exposer une lecture qui n'est appelée que
// depuis un composant serveur serait une surface d'attaque offerte pour rien.
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
      ownerConsentRequestedAt: true,
    },
  });
  if (!place) return null;

  // L'expiration ne s'applique qu'à un lien ENCORE EN ATTENTE. Une fois la
  // décision prise, la page n'expose plus aucune donnée : elle ne sert qu'à
  // rappeler ce qui a été décidé, et cette preuve n'a pas à se périmer.
  if (place.ownerConsentStatus === "PENDING" && isConsentLinkExpired(place.ownerConsentRequestedAt)) {
    return null;
  }
  return {
    placeName: place.name,
    ownerName: place.ownerName,
    ownerPhone: place.ownerPhone,
    ownerEmail: place.ownerEmail,
    status: place.ownerConsentStatus,
    decidedAt: place.ownerConsentDecidedAt,
  };
}

interface RequestInput {
  to: string;
  token: string;
}

/**
 * Envoie la demande de validation.
 *
 * SÉCURITÉ — le message est **entièrement générique**. Aucune valeur rédigée
 * par un utilisateur n'y figure : ni le nom du lieu, ni celui du propriétaire.
 * Un chef pourrait sinon nommer un lieu « URGENT : votre colis est bloqué » et
 * l'application émettrait ce texte vers une adresse arbitraire, signé de son
 * domaine et accompagné d'un lien légitime — un hameçonnage parfait, servi par
 * nous. Valider l'adresse du destinataire ne suffisait pas : le contenu compte
 * autant. La signature de la fonction ne reçoit d'ailleurs plus ces valeurs,
 * ce qui rend la fuite impossible plutôt qu'interdite.
 *
 * Le contexte (quel lieu, quelles coordonnées) est délivré derrière le jeton,
 * sur une page que nous contrôlons.
 *
 * Ne lève jamais : `sendEmail` dégrade
 * proprement quand Resend n'est pas configuré (dev local, prod sans domaine
 * vérifié). Un envoi raté ne doit pas faire échouer la création du lieu —
 * le contact reste alors simplement en attente, donc invisible, et le chef
 * dispose d'un bouton de relance.
 */
export async function sendOwnerConsentRequest({
  to,
  token,
}: RequestInput): Promise<void> {
  const url = escapeHtml(ownerConsentUrl(token));
  // Seule variable du message, et elle vient de l'ENVIRONNEMENT (CONF-01) :
  // identique pour tous les envois de cette instance, hors de portée d'un
  // utilisateur. Tout le reste est figé.
  const groupe = escapeHtml(headerSafe(process.env.ORG_GROUP?.trim() || "un groupe scout"));

  const html = `
    <p>Bonjour,</p>
    <p>
      Le groupe scout <strong>${groupe}</strong> utilise une application interne
      pour organiser ses camps. Vos coordonnées y sont enregistrées comme
      contact d'un lieu où il campe.
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

  // Dernier verrou avant l'envoi. L'appelant valide déjà à la saisie ; on ne
  // fait pas dépendre une propriété de sécurité du fait qu'il y ait pensé.
  const recipient = parseOwnerEmail(to);
  if (!recipient.ok || !recipient.value) {
    // Dernier verrou : on n'envoie jamais vers une adresse non validée, même si
    // un appelant a oublié de la contrôler en amont.
    console.warn("[rgpd-09] Adresse de propriétaire invalide — aucun envoi.");
    return;
  }

  await sendEmail({
    to: recipient.value,
    subject: headerSafe(`Vos coordonnées enregistrées par ${process.env.ORG_GROUP?.trim() || "un groupe scout"}`),
    html,
  });
}
