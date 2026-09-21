// SAFE-02 — logique pure de modération.
//
// - Visibilité d'un message masqué : un message dont `hiddenAt` est renseigné
//   ne s'affiche plus dans les lectures normales (salon, DM) — la trace reste
//   en base, consultable via la file de modération. `queries.ts`/`dm-queries.ts`
//   filtrent déjà côté requête (`hiddenAt: null`) ; cette fonction est la
//   décision de référence, utilisée aussi côté file de modération pour savoir
//   si un contenu signalé est déjà masqué.
// - Éligibilité modérateur : même garde que `can(user, "moderation.review")`,
//   exposée séparément pour être testée sans dépendre de Prisma et pour piloter
//   l'affichage des actions côté UI.
// - Routage par unité (raffinement SAFE-02) : un signalement est rattaché à
//   l'unité de l'auteur du message visé (`Report.concernedUnit`, figée à la
//   création). Un CHEF ne peut traiter que les signalements de SA unité ;
//   l'ADMIN peut tout traiter. `canModerateReport` combine ça à `canModerate`
//   (la permission `moderation.review`, indépendante de l'unité).

import { can, effectiveRoles, inUnitScope, type Action } from "@/lib/permissions";

type ModerationCtx = Parameters<typeof can>[0];

export function isVisibleMessage(hiddenAt: Date | null): boolean {
  return hiddenAt === null;
}

export function canModerate(user: ModerationCtx): boolean {
  const action: Action = "moderation.review";
  return can(user, action);
}

// Auteur du contenu visé par un signalement (résolu côté requête selon
// `targetType` : `Message.author` pour un salon, `DirectMessage.sender` pour
// un DM) — `null`/`undefined` si le message n'a pas pu être résolu.
interface ReportedAuthor {
  unit: string | null;
}

// Unité concernée par un signalement = celle de l'auteur du message visé.
// `null` si l'auteur n'a pas d'unité renseignée (ex. compte ADULTES) : dans ce
// cas, seul un ADMIN pourra router/traiter le signalement (fail-closed, cf.
// `canModerateReport` et `selectReportRecipients` ci-dessous).
export function resolveConcernedUnit(author: ReportedAuthor | null | undefined): string | null {
  return author?.unit ?? null;
}

interface ReportUnitCtx {
  concernedUnit: string | null;
  // Auteur du contenu signalé (#91), résolu côté requête ; `null` si le
  // message est introuvable. Obligatoire pour qu'aucun appelant ne l'oublie.
  targetAuthorId: string | null;
}

// #91 — la personne mise en cause ne voit ni ne traite le signalement qui la
// vise, quel que soit son rôle : elle connaîtrait le signalant et pourrait
// classer l'affaire elle-même.
function isTargetAuthor(userId: string | undefined, targetAuthorId: string | null): boolean {
  return targetAuthorId !== null && userId === targetAuthorId;
}

// Un modérateur peut traiter (masquer / résoudre / rejeter) un signalement
// s'il a `moderation.review` (CHEF ou ADMIN, cf. `PERMISSIONS`) ET :
//  - c'est un ADMIN (superutilisateur, toutes les unités) ;
//  - OU c'est un CHEF de l'unité concernée par le signalement.
// Un signalement dont `concernedUnit` est null (auteur sans unité) n'est
// traitable que par un ADMIN — fail-closed plutôt que d'ouvrir à tous les CHEF.
// Jamais par l'auteur du contenu signalé (#91).
export function canModerateReport(user: ModerationCtx, report: ReportUnitCtx): boolean {
  // ADMIN et RESPONSABLE_GROUPE traitent toutes les unités ; un CHEF est limité
  // à l'unité concernée par le signalement — c'est exactement `inUnitScope`,
  // dont cette règle était l'implémentation d'origine (SAFE-02).
  return (
    canModerate(user) &&
    inUnitScope(user, report.concernedUnit) &&
    !isTargetAuthor(user.id, report.targetAuthorId)
  );
}

interface ModeratorCandidate {
  id: string;
  role?: string;
  roles?: string[] | string | null;
  unit?: string | null;
}

// Destinataires de la notification à la CRÉATION d'un signalement : tous les
// ADMIN et RESPONSABLE_GROUPE (toutes unités) + les CHEF de l'unité concernée,
// sauf l'auteur du contenu signalé (#91). Symétrique de
// `canModerateReport` (mêmes règles de routage), mais appliquée à une liste de
// comptes candidats (déjà filtrés ACTIVE côté requête) plutôt qu'à un seul.
export function selectReportRecipients(
  users: ModeratorCandidate[],
  concernedUnit: string | null,
  targetAuthorId: string | null,
): string[] {
  return users
    .filter((u) => {
      if (isTargetAuthor(u.id, targetAuthorId)) return false;
      const roles = effectiveRoles(u);
      if (roles.includes("ADMIN") || roles.includes("RESPONSABLE_GROUPE")) return true;
      return concernedUnit !== null && roles.includes("CHEF") && u.unit === concernedUnit;
    })
    .map((u) => u.id);
}

// #92 — copie du contenu signalé, prise par `reportMessage` et stockée en JSON
// dans `Report.targetSnapshot`. L'auteur y est un id, jamais un nom : le nom se
// résout à la lecture, pour que l'anonymisation du compte s'applique.
export interface ReportTargetSnapshot {
  body: string;
  authorId: string;
}

// `null` pour un signalement antérieur à #92 (pas de copie) ou une copie
// illisible — la modération retombe alors sur le message actuel.
export function parseTargetSnapshot(raw: string | null): ReportTargetSnapshot | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ReportTargetSnapshot).body === "string" &&
      typeof (parsed as ReportTargetSnapshot).authorId === "string"
    ) {
      const { body, authorId } = parsed as ReportTargetSnapshot;
      return { body, authorId };
    }
  } catch {
    // copie illisible : traitée comme absente
  }
  return null;
}

export type ReportTargetState = "UNCHANGED" | "EDITED" | "DELETED";

// État du message visé par rapport à la copie : l'auteur peut toujours le
// modifier ou le supprimer (modèle Discord), la modération doit le savoir.
// `null` sans copie : on ne peut rien comparer.
export function reportTargetState(
  snapshot: ReportTargetSnapshot | null,
  current: { body: string } | null,
): ReportTargetState | null {
  if (!snapshot) return null;
  if (!current) return "DELETED";
  return current.body === snapshot.body ? "UNCHANGED" : "EDITED";
}
