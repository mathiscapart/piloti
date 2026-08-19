// US-P04 — qui est CONCERNÉ par un événement, et peut donc s'y inscrire.
//
// Un événement porte une branche (`Event.unit`) ; `null` signifie « tout le
// groupe ». Jusqu'ici `rsvpEvent` ne regardait jamais ce champ : n'importe quel
// compte actif pouvait s'inscrire à n'importe quel événement ouvert — un
// Louveteau de 8 ans au week-end Pionniers, par exemple. Le chemin chef
// (`addRegistration`) appliquait pourtant déjà cette règle : le libre-service
// était donc plus permissif que le chemin encadré.
//
// Logique pure et sans dépendance : elle est partagée par la Server Action (qui
// refuse) et par la fiche événement (qui n'affiche pas le contrôle), afin que
// l'écran ne propose jamais une inscription que le serveur rejettera.

/**
 * `targetUnit` est la branche de la PERSONNE INSCRITE — le jeune, pas le parent
 * qui remplit le formulaire : c'est l'enfant qui doit être concerné.
 * Une branche non renseignée (`null`) n'est concernée que par les événements de
 * groupe, jamais par une branche précise (fail-closed).
 */
export function isConcernedByEvent(
  eventUnit: string | null,
  targetUnit: string | null,
): boolean {
  if (eventUnit === null) return true; // événement de groupe : tout le monde
  return targetUnit === eventUnit;
}
