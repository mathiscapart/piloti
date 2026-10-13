// Issue #110 — règles d'archivage d'un article. Un article archivé est en
// lecture seule (on le restaure pour le modifier) et ne s'archive pas tant
// qu'un prêt est actif : le prêt en cours pointerait vers un article masqué.

import { ACTIVE_LOAN_STATUSES } from "@/lib/enums";

export const ACTIVE_LOAN_ARCHIVE_ERROR =
  "Cet article est en prêt : clôture le prêt avant de l'archiver.";
export const ARCHIVED_READ_ONLY_ERROR =
  "Cet article est archivé : restaure-le avant de le modifier.";

export function archiveRefusal(loanStatuses: string[]): string | null {
  const active: readonly string[] = ACTIVE_LOAN_STATUSES;
  return loanStatuses.some((status) => active.includes(status))
    ? ACTIVE_LOAN_ARCHIVE_ERROR
    : null;
}

export function updateRefusal(
  equipment: { archived: boolean } | null,
): string | null {
  if (!equipment) return "Article introuvable.";
  return equipment.archived ? ARCHIVED_READ_ONLY_ERROR : null;
}
