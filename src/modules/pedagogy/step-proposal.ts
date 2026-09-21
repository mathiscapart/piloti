// #100 — une étape ne se propose que pour un jeune de SA branche, et tant
// qu'elle n'est pas archivée (la frise n'affiche que celles-là : un appel direct
// ne doit pas pouvoir valider une étape invisible).
// Renvoie le message d'erreur à afficher, ou `null` si la proposition est recevable.
export function stepProposalError(
  step: { unit: string; archived: boolean },
  jeuneUnit: string | null,
): string | null {
  if (step.unit !== jeuneUnit) return "Cette étape n'appartient pas à la branche de ce jeune.";
  if (step.archived) return "Cette étape est archivée : elle ne peut plus être proposée.";
  return null;
}
