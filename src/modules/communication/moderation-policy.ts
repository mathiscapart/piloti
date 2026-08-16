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

import { can, effectiveRoles, type Action } from "@/lib/permissions";

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
}

// Un modérateur peut traiter (masquer / résoudre / rejeter) un signalement
// s'il a `moderation.review` (CHEF ou ADMIN, cf. `PERMISSIONS`) ET :
//  - c'est un ADMIN (superutilisateur, toutes les unités) ;
//  - OU c'est un CHEF de l'unité concernée par le signalement.
// Un signalement dont `concernedUnit` est null (auteur sans unité) n'est
// traitable que par un ADMIN — fail-closed plutôt que d'ouvrir à tous les CHEF.
export function canModerateReport(user: ModerationCtx, report: ReportUnitCtx): boolean {
  if (!canModerate(user)) return false;
  const roles = effectiveRoles(user);
  // ADMIN et RESPONSABLE_GROUPE traitent toutes les unités ; un CHEF est limité
  // à l'unité concernée par le signalement.
  if (roles.includes("ADMIN") || roles.includes("RESPONSABLE_GROUPE")) return true;
  return report.concernedUnit !== null && user.unit === report.concernedUnit;
}

interface ModeratorCandidate {
  id: string;
  role?: string;
  roles?: string[] | string | null;
  unit?: string | null;
}

// Destinataires de la notification à la CRÉATION d'un signalement : tous les
// ADMIN (toutes unités) + les CHEF de l'unité concernée. Symétrique de
// `canModerateReport` (mêmes règles de routage), mais appliquée à une liste de
// comptes candidats (déjà filtrés ACTIVE côté requête) plutôt qu'à un seul.
export function selectReportRecipients(
  users: ModeratorCandidate[],
  concernedUnit: string | null,
): string[] {
  return users
    .filter((u) => {
      const roles = effectiveRoles(u);
      if (roles.includes("ADMIN")) return true;
      return concernedUnit !== null && roles.includes("CHEF") && u.unit === concernedUnit;
    })
    .map((u) => u.id);
}
