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

import { can, type Action } from "@/lib/permissions";

type ModerationCtx = Parameters<typeof can>[0];

export function isVisibleMessage(hiddenAt: Date | null): boolean {
  return hiddenAt === null;
}

export function canModerate(user: ModerationCtx): boolean {
  const action: Action = "moderation.review";
  return can(user, action);
}
