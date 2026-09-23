// #100 — une étape ne se propose que pour un jeune de SA branche, et tant
// qu'elle n'est pas archivée (la frise n'affiche que celles-là : un appel direct
// ne doit pas pouvoir valider une étape invisible).
// Renvoie le message d'erreur à afficher, ou `null` si la proposition est recevable.
export function stepProposalError(
  step: { unit: string; archived: boolean },
  jeuneUnit: string | null,
): string | null {
  if (step.unit !== jeuneUnit) return "Cette étape n'appartient pas à la branche de ce jeune.";
  if (step.archived) return "Cette étape est archivée : elle ne peut plus être validée.";
  return null;
}

// #152 — la confirmation revérifie tout ce que la proposition a vérifié : entre
// les deux, l'étape a pu être archivée, et une proposition hors branche créée
// avant #100 ne doit pas devenir une étape validée.
export function stepConfirmationError(
  validation: { status: string; proposedById: string | null },
  step: { unit: string; archived: boolean },
  jeuneUnit: string | null,
  confirmerId: string,
): string | null {
  if (validation.status === "CONFIRMED") return "Étape déjà validée.";
  // Règle des 2 chefs : le confirmateur doit différer du proposeur. Combinée au
  // périmètre d'unité, la 2e validation vient forcément d'un chef de la branche.
  if (validation.proposedById === confirmerId) {
    return "Un autre chef doit confirmer cette étape (validation à 2).";
  }
  return stepProposalError(step, jeuneUnit);
}
