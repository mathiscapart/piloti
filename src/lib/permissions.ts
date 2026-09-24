// Matrice de permissions Piloti — source unique.
// Chaque Server Action / page guard appelle `can(user, action)` avant d'exécuter
// une opération sensible.
//
// US-29 — moteur par rôle, multi-rôles : un compte a un rôle principal
// (User.role) + des rôles additionnels (User.roles, JSON). `can()` évalue
// l'UNION des rôles (le rôle le plus permissif l'emporte). ADMIN est
// superutilisateur (toutes les actions).
//
// US-32 — redéfinition de la matrice pour tous les rôles :
//   ADMIN, RESPONSABLE_GROUPE (RG), CHEF, RESPONSABLE_MATERIEL, TRESORIER,
//   SECRETAIRE, MEMBRE_LOCAL, PARENT, SCOUT.
//   Les actions de LECTURE sont distinctes des actions de MUTATION
//   (`*.view` vs `*.create/...`).
//   Permission conditionnée par la branche : un JEUNE (SCOUT) des branches
//   Pionniers/Compagnons peut créer un prêt.
//
// #173 (amende US-32) — le RG n'est plus en lecture seule : il écrit sur tout
//   le groupe (union des droits CHEF, TRESORIER, RESPONSABLE_MATERIEL,
//   SECRETAIRE, plus la gestion du contenu d'autrui). Il est ajouté action par
//   action, sans court-circuit dans `can()`. Lui restent fermés : `admin.access`
//   (zone technique), l'attribution des rôles ADMIN/RG (`canAssignRole`), la
//   définition d'un mot de passe et la suppression d'un compte, et le
//   pédagogique des chefs de branche (`pedago.manage`, `pedago.referential`,
//   notes de suivi sensibles).
//
// Périmètre d'unité — la matrice ci-dessous ne dit QUE « quel rôle a le droit ».
// Certaines actions valent en plus « seulement sur ma branche » : c'est
// `inUnitScope()` (bas de fichier), appelé EN PLUS de `can()` par les surfaces
// concernées (écriture pédagogique, pointage des présences, modération).

import type { AccountStatus, Role } from "@/lib/enums";

export const ACTIONS = [
  // Inventaire
  "equipment.view",
  "equipment.create",
  "equipment.update",
  "equipment.archive",
  "equipment.status.change",
  "category.manage",
  // Prêts
  "loan.view",
  "loan.create",
  "loan.return.validate",
  // Incidents
  "incident.view",
  "incident.report",
  "incident.resolve",
  // Comptes / membres
  "admin.access",
  "audit.view", // journal d'audit en lecture (ADMIN + RG)
  "user.approve", // valider/refuser les inscriptions (+ attribuer les rôles)
  "user.manage", // gérer les comptes existants : rôles (page /admin/utilisateurs)
  "user.password.set", // définir le mot de passe d'un compte (ADMIN seul, #173)
  "user.delete", // supprimer (anonymiser) un compte (ADMIN seul, #173)
  "member.view",
  "member.family.manage", // rattachement parent ↔ jeune (CHEF, RG, SEC)
  "member.directory", // US-26 — annuaire des compétences parents (RG)
  "member.image_rights.manage", // US-C08 — définir le statut de droit à l'image (RG + SEC)
  // Dons
  "donation.create",
  "donation.view", // consulter les dons (RESPONSABLE_MATERIEL + RG)
  "donation.review",
  // Communication
  "announcement.publish", // US-C01/C05 — publier une annonce (+ diffusion urgente)
  "announcement.manage_any", // #111 — lecteurs, relance, suppression de l'annonce d'un autre (l'auteur gère les siennes)
  "message.manage_any", // #92 — modifier / supprimer le message d'un autre (l'auteur, lui, gère les siens)
  "channel.moderate", // épingler un message, clore le sondage d'un autre (l'auteur clôt le sien)
  // SAFE-02 — signalement & modération de contenu (salons + messagerie privée).
  "moderation.view", // consulter la file de modération (CHEF + RG)
  "moderation.review", // traiter la file : masquer un message, résoudre/rejeter
  // Planning & événements (US-P01/P02/P03)
  "event.view", // consulter le calendrier (tout utilisateur actif)
  "event.manage", // créer / modifier / supprimer un événement (encadrants)
  // Tâches / to-do (US-P10)
  "task.view", // consulter les tâches (tout utilisateur actif)
  "task.manage", // créer / modifier / supprimer une tâche (encadrants)
  // Finances — notes de frais (US-F06/F07)
  "expense.create", // déclarer une note de frais
  "expense.view", // consulter les notes de frais (les siennes / toutes)
  "expense.manage", // valider / rembourser / refuser (trésorier)
  // Finances — cotisations (US-F01/F02)
  "campaign.view", // consulter les campagnes / suivi des paiements
  "campaign.manage", // créer une campagne, enregistrer des paiements (trésorier)
  // Finances — budget d'événement & encaissement (US-F04/F05)
  "budget.view", // consulter le budget d'un événement
  "budget.manage", // éditer le budget, le tarif, encaisser (chef / trésorier)
  // Lieux de camp (US-L01…L06)
  "place.view", // consulter les lieux de camp (encadrement)
  "place.create", // créer un lieu de camp
  "place.manage", // modifier / archiver un lieu (créateur, RG ou admin, cf. action)
  // RGPD-09 — le contact du propriétaire est la donnée personnelle d'un TIERS
  // qui n'utilise pas l'app. On protège le CHAMP, pas la ressource : consulter
  // un lieu (budget d'un camp, équipements) reste légitime pour l'encadrement
  // large, connaître le numéro personnel du propriétaire ne l'est que pour qui
  // organise réellement le camp.
  "place.owner_contact.view",
  "place.owner_contact.erase", // effacer le contact à la demande du propriétaire
  "place.review", // déposer un avis après un camp
  // Suivi pédagogique (US-S01…S10)
  "pedago.view", // consulter la progression / fiches (encadrement + RG)
  "pedago.manage", // valider étape, attribuer badge, objectifs, notes (chef)
  "pedago.validation.cancel", // #100 — annuler une étape CONFIRMÉE (RG + ADMIN)
  "pedago.referential", // gérer le référentiel d'étapes & le catalogue de badges
] as const;
export type Action = (typeof ACTIONS)[number];

interface AuthCtx {
  // Optionnel : uniquement utilisé pour tracer un `roles` corrompu (cf.
  // `effectiveRoles`) ; absent → le log se contente d'un contexte partiel.
  id?: string;
  role: Role | string;
  // Rôles additionnels : tableau, ou chaîne JSON (telle que stockée en base).
  roles?: string[] | string | null;
  // Branche/unité — nécessaire pour les permissions conditionnées (ex. JEUNE).
  unit?: string | null;
  // Optionnel : `effectiveRoles`/`hasRole` n'en ont pas besoin ; `can()` exige
  // ACTIVE (un status absent → non autorisé).
  status?: AccountStatus | string;
}

// Ouvert à tout utilisateur ACTIVE, quel que soit le rôle.
const ANY_ACTIVE = new Set<Action>([
  "donation.create",
  "event.view",
  "task.view",
]);

// Pour chaque action, les rôles (hors ADMIN, superutilisateur) qui l'autorisent.
// Une action absente / à liste vide = réservée à l'ADMIN.
// RG (#173) : présent sur toutes les actions sauf `admin.access`,
// `user.password.set`, `user.delete`, `pedago.manage` et `pedago.referential`.
const CHEF = "CHEF";
const RG = "RESPONSABLE_GROUPE";
const MAT = "RESPONSABLE_MATERIEL";
const TRES = "TRESORIER";
const SEC = "SECRETAIRE";
const LOCAL = "MEMBRE_LOCAL";

const PERMISSIONS: Record<Action, Role[]> = {
  // Inventaire — encadrants + RG + responsable matériel.
  "equipment.view": [CHEF, RG, MAT],
  "equipment.create": [CHEF, RG, MAT],
  "equipment.update": [CHEF, RG, MAT],
  "equipment.archive": [CHEF, RG, MAT],
  "equipment.status.change": [CHEF, RG, MAT],
  "category.manage": [CHEF, RG, MAT],
  // Prêts — TRESORIER voit les prêts ; CHEF/RG/MAT gèrent.
  "loan.view": [CHEF, RG, MAT, TRES],
  "loan.create": [CHEF, RG, MAT], // + JEUNE Pios/Compas (conditionné, cf. can())
  "loan.return.validate": [CHEF, RG, MAT],
  // Incidents — PARENT peut créer ; MAT et RG créent et résolvent.
  "incident.view": [CHEF, RG, MAT],
  "incident.report": [CHEF, RG, MAT, "PARENT"],
  "incident.resolve": [RG, MAT],
  // Comptes / membres
  "admin.access": [], // ADMIN only (zone technique), RG compris (#173)
  "audit.view": [RG],
  // US-32 — la SECRÉTAIRE et le RG (#173) valident les inscriptions et
  // attribuent les rôles, sauf ADMIN/RG : garde-fou anti-élévation, cf.
  // canAssignRole. Le RG ne peut donc ni se promouvoir ni toucher un autre RG.
  "user.approve": [RG, SEC],
  "user.manage": [RG, SEC],
  // #173 — se connecter à la place de quelqu'un ou effacer un compte sont
  // réservés à l'ADMIN, secrétaire et RG compris (décision du 2026-09-24).
  "user.password.set": [],
  "user.delete": [],
  "member.view": [CHEF, RG, SEC, TRES],
  // Rattachement familial parent ↔ jeune. Permission DÉDIÉE, volontairement
  // séparée de `user.manage` : celle-ci ouvre l'attribution des rôles, et
  // l'élargir au CHEF aurait été une élévation de privilèges. ADMIN superuser.
  "member.family.manage": [CHEF, RG, SEC],
  // Annuaire des compétences : RG + SECRÉTAIRE (US-32) ; ADMIN superuser.
  "member.directory": [RG, SEC],
  // US-C08 — droit à l'image : RG et SEC (dossiers admin des membres) ;
  // ADMIN superuser.
  "member.image_rights.manage": [RG, SEC],
  // Dons — MAT et RG consultent, acceptent, refusent ; ADMIN.
  "donation.create": [], // géré par ANY_ACTIVE
  "donation.view": [MAT, RG],
  "donation.review": [MAT, RG],
  // Communication — publier une annonce / diffusion urgente : encadrants.
  "announcement.publish": [CHEF, RG],
  // #92 — l'auteur modifie / supprime ses propres messages (contrôle dans
  // l'action) ; le contenu d'un autre : RG (#173) et ADMIN.
  "announcement.manage_any": [RG],
  "message.manage_any": [RG],
  "channel.moderate": [CHEF, RG],
  // SAFE-02 — la file de modération se consulte ET se traite par les chefs et le
  // responsable de groupe (masquer, résoudre, rejeter). Un CHEF est limité à son
  // unité (cf. canModerateReport) ; RG et ADMIN voient et traitent toutes les unités.
  "moderation.view": [CHEF, RG],
  "moderation.review": [CHEF, RG],
  // Planning — consultation ouverte à tous (ANY_ACTIVE) ; gestion = chefs + RG.
  "event.view": [],
  "event.manage": [CHEF, RG],
  // Tâches — consultation ouverte à tous (ANY_ACTIVE) ; gestion = chefs + RG.
  "task.view": [],
  "task.manage": [CHEF, RG],
  // Finances — déclaration par les encadrants ; gestion par le trésorier et le
  // RG, hors ses propres notes (cf. canReviewExpense). Le déclarant voit
  // toujours ses propres notes (filtré côté requête).
  // Déclaration ouverte à tous les rôles encadrants / fonctionnels — SAUF
  // parents et jeunes (qui n'avancent pas de frais pour le groupe).
  "expense.create": [CHEF, MAT, TRES, SEC, RG, LOCAL],
  "expense.view": [CHEF, MAT, TRES, SEC, RG, LOCAL],
  "expense.manage": [TRES, RG],
  // Cotisations — gestion par le trésorier et le RG.
  "campaign.view": [TRES, RG],
  "campaign.manage": [TRES, RG],
  // Budget d'événement — construit par chef, trésorier (US-F04) ou RG.
  "budget.view": [CHEF, TRES, RG],
  "budget.manage": [CHEF, TRES, RG],
  // Lieux de camp — consultation pour l'encadrement ; création et avis par les
  // chefs et le RG ; la modification ajoute un contrôle « créateur, RG ou
  // admin » dans l'action (US-L05, #173).
  "place.view": [CHEF, RG, MAT, TRES, SEC, LOCAL],
  // RGPD-09 — minimisation : deux rôles seulement, ceux qui organisent le camp.
  "place.owner_contact.view": [CHEF, RG],
  "place.owner_contact.erase": [CHEF, RG],
  "place.create": [CHEF, RG],
  "place.manage": [CHEF, RG],
  "place.review": [CHEF, RG],
  // Suivi pédagogique — gestion par les chefs ; RG en lecture (#173 : le
  // pédagogique reste aux chefs de branche). Le jeune et le parent accèdent à
  // LEURS ressources via une logique dédiée dans la page (pas par `can()`),
  // hors notes sensibles (US-S07/S10).
  "pedago.view": [CHEF, RG],
  "pedago.manage": [CHEF],
  // #100 — une étape confirmée par deux chefs ne se défait pas par un seul :
  // l'annulation est réservée au RG (un arbitrage) et à l'ADMIN. Une
  // proposition non confirmée reste retirable par les chefs de la branche
  // (`pedago.manage`).
  "pedago.validation.cancel": [RG],
  "pedago.referential": [CHEF],
};

/**
 * Rôles effectifs de l'utilisateur. Modèle unifié (US-32) : un compte porte un
 * SEUL ensemble de rôles dans `roles` (JSON), n'importe quelle combinaison
 * (ex. juste ["TRESORIER"]). Le champ `role` n'est plus qu'un miroir d'affichage.
 */
export function effectiveRoles(user: Partial<AuthCtx>): string[] {
  if (Array.isArray(user.roles)) return user.roles.map(String);
  if (typeof user.roles === "string" && user.roles.trim() !== "") {
    try {
      const parsed = JSON.parse(user.roles);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (err) {
      // Fail-closed : on retourne bien [] (aucun droit), mais on trace
      // l'anomalie — un `roles` corrompu prive silencieusement un compte de
      // ses droits, ce qui doit rester visible pour l'admin/le support.
      console.warn(
        `[permissions] effectiveRoles: JSON "roles" invalide pour l'utilisateur ${user.id ?? "?"} — fail-closed, aucun rôle accordé.`,
        err,
      );
      return [];
    }
  }
  return [];
}

export function can(user: AuthCtx, action: Action): boolean {
  if (user.status !== "ACTIVE") return false;

  const roles = effectiveRoles(user);
  // ADMIN = superutilisateur.
  if (roles.includes("ADMIN")) return true;
  if (ANY_ACTIVE.has(action)) return true;

  // US-32 — permission conditionnée par la branche : un JEUNE (SCOUT) des
  // branches Pionniers / Compagnons peut créer un prêt.
  if (
    action === "loan.create" &&
    roles.includes("SCOUT") &&
    (user.unit === "PIONNIERS" || user.unit === "COMPAGNONS")
  ) {
    return true;
  }

  const allowed = PERMISSIONS[action] ?? [];
  return roles.some((r) => (allowed as string[]).includes(r));
}

/** Pratique pour l'UI : l'utilisateur possède-t-il ce rôle (principal ou additionnel) ? */
export function hasRole(user: AuthCtx, role: Role): boolean {
  return effectiveRoles(user).includes(role);
}

/**
 * Périmètre d'unité. `can()` répond « ce rôle a-t-il le droit ? » ; cette
 * fonction répond « sur QUELLE branche ? ». Les deux se combinent : le rôle
 * donne le droit, l'unité en donne l'étendue — un CHEF est chef de SA branche,
 * pas du groupe. Généralisation de `canModerateReport` (SAFE-02), qui en est
 * désormais un cas d'usage.
 *
 * - ADMIN (superutilisateur) et RESPONSABLE_GROUPE (vue groupe) ne sont pas bornés.
 * - Fail-closed : un CHEF sans `unit` renseignée n'encadre aucune branche, et
 *   une ressource sans unité (`targetUnit === null`) n'appartient à personne.
 *   Le cas inverse — une ressource « de groupe » ouverte à tout l'encadrement,
 *   ex. un événement sans unité — se traite AU SITE D'APPEL (`unit === null ||
 *   inUnitScope(...)`), pas ici : la primitive ne devine pas la sémantique du null.
 *
 * Ne contrôle pas le statut du compte : c'est le rôle de `can()`, qu'on appelle
 * toujours en premier.
 */
export function inUnitScope(user: AuthCtx, targetUnit: string | null): boolean {
  const roles = effectiveRoles(user);
  if (roles.includes("ADMIN") || roles.includes("RESPONSABLE_GROUPE")) return true;
  return targetUnit !== null && user.unit === targetUnit;
}

// Rôles rattachés à une branche. Tous les autres — trésorier, secrétaire,
// responsable matériel, responsable de groupe, admin — exercent une fonction
// TRANSVERSE au groupe : les borner à une unité n'aurait pas de sens (le
// trésorier encaisse pour tout le monde), et les casserait puisqu'ils n'ont
// généralement pas de `unit` renseignée.
const UNIT_BOUND_ROLES = new Set<string>([CHEF]);

/**
 * Périmètre d'unité pour UNE action donnée : « ce compte peut-il faire cette
 * action sur cette branche ? ». Combine `can()` et `inUnitScope()`, en tenant
 * compte du rôle par lequel le droit arrive.
 *
 * La nuance est indispensable dès qu'une action est partagée entre un rôle
 * borné et un rôle transverse : `budget.manage` appartient au CHEF **et** au
 * TRÉSORIER. Le chef ne gère que le budget des événements de sa branche ; le
 * trésorier gère tout, sans quoi il ne pourrait plus rien encaisser. On ne
 * borne donc que si le droit ne vient QUE de rôles bornés.
 *
 * Dans ce cas, la borne est la branche du compte, sans l'exemption de groupe
 * d'`inUnitScope` : un RG aussi CHEF n'a le pédagogique, réservé aux chefs
 * (#173), que sur sa propre branche. Ses droits de RG restent sans borne.
 */
export function canActOnUnit(
  user: AuthCtx,
  action: Action,
  targetUnit: string | null,
): boolean {
  if (!can(user, action)) return false;
  if (ANY_ACTIVE.has(action)) return true;
  const roles = effectiveRoles(user);
  if (roles.includes("ADMIN")) return true;
  // Le droit vient-il (aussi) d'un rôle non borné ? Alors aucune limite d'unité.
  const allowed = PERMISSIONS[action] ?? [];
  const viaRoleTransverse = roles.some(
    (r) => !UNIT_BOUND_ROLES.has(r) && (allowed as string[]).includes(r),
  );
  if (viaRoleTransverse) return true;
  return targetUnit !== null && user.unit === targetUnit;
}

/**
 * US-S07 — notes de suivi sensibles d'un jeune (#98). Contrairement au reste de
 * la progression (`pedago.view`, lecture ouverte à l'encadrement et au RG), elles
 * ne se lisent que là où elles s'écrivent : chefs de la branche du jeune et
 * ADMIN. Condition unique pour CHARGER, AFFICHER et ÉCRIRE : une note qu'on n'a
 * pas le droit de lire n'est jamais envoyée au navigateur.
 *
 * #173 — le RG ne les lit ni ne les écrit (#98 maintenu) ; un RG aussi CHEF
 * les lit comme un chef, sur sa seule branche (cf. `canActOnUnit`).
 */
export function canReadPedagoNotes(user: AuthCtx, jeuneUnit: string | null): boolean {
  return canActOnUnit(user, "pedago.manage", jeuneUnit);
}

/**
 * #103 / #173 — valider, refuser ou rembourser une note de frais. Le RG ne
 * traite pas SA propre note, même s'il est aussi trésorier. Le trésorier seul
 * n'est pas encore tranché (#103) : comportement inchangé pour lui.
 */
export function canReviewExpense(
  user: AuthCtx,
  expense: { declarantId: string },
): boolean {
  if (!can(user, "expense.manage")) return false;
  const ownNote = user.id !== undefined && expense.declarantId === user.id;
  return !(ownNote && hasRole(user, RG));
}

/**
 * US-L05 — modifier / archiver un lieu de camp : son créateur, le RG (#173) ou
 * l'ADMIN. Un lieu dont le créateur a été anonymisé (`createdById` null) n'est
 * plus géré que par le RG et l'ADMIN.
 */
export function canManagePlace(
  user: AuthCtx,
  place: { createdById: string | null },
): boolean {
  if (!can(user, "place.manage")) return false;
  const roles = effectiveRoles(user);
  if (roles.includes("ADMIN") || roles.includes(RG)) return true;
  return user.id !== undefined && place.createdById === user.id;
}

/**
 * Branches sur lesquelles `user` a la main, dérivées de `inUnitScope` (pendant
 * de `assignableRoles` pour les rôles). Pratique pour filtrer une requête ou un
 * sélecteur d'unité sans jamais tester un rôle en dur côté page :
 * liste complète = non borné (ADMIN/RG), liste vide = aucun périmètre.
 */
export function scopedUnits(user: AuthCtx, catalog: readonly string[]): string[] {
  return catalog.filter((u) => inUnitScope(user, u));
}

// US-32 — la zone /admin n'est plus 100 % ADMIN : différentes rubriques sont
// ouvertes à la SECRÉTAIRE (inscriptions, comptes), au RESPONSABLE_MATERIEL
// (catégories, dons), au CHEF (catégories) et au RG (tout sauf la zone
// technique, #173). L'accès à la zone est accordé
// dès qu'au moins une rubrique est accessible ; chaque page se reprotège.
const ADMIN_ZONE_ACTIONS: Action[] = [
  "admin.access",
  "audit.view",
  "user.approve",
  "user.manage",
  "category.manage",
  "donation.view",
];

export function canAccessAdminZone(user: AuthCtx): boolean {
  return ADMIN_ZONE_ACTIONS.some((a) => can(user, a));
}

// US-32 — garde-fou anti-élévation de privilèges : seul l'ADMIN peut attribuer
// les rôles sensibles (ADMIN, RESPONSABLE_GROUPE). La SECRÉTAIRE et le RG
// (#173) attribuent tous les autres rôles.
const PRIVILEGED_ROLES = new Set<string>(["ADMIN", "RESPONSABLE_GROUPE"]);

export function canAssignRole(actor: AuthCtx, role: string): boolean {
  if (can(actor, "admin.access")) return true; // ADMIN attribue tout
  return !PRIVILEGED_ROLES.has(role);
}

/** Liste des rôles que `actor` est autorisé à attribuer (pour filtrer l'UI). */
export function assignableRoles(actor: AuthCtx, catalog: readonly string[]): string[] {
  return catalog.filter((r) => canAssignRole(actor, r));
}
