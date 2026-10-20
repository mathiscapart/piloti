// Issue #110 — règles d'archivage d'un article. Un article archivé est en
// lecture seule (on le restaure pour le modifier) et ne s'archive pas tant
// qu'un prêt est actif : le prêt en cours pointerait vers un article masqué.

export const ACTIVE_LOAN_ARCHIVE_ERROR =
  "Cet article est en prêt : clôture le prêt avant de l'archiver.";
export const ARCHIVED_READ_ONLY_ERROR =
  "Cet article est archivé : restaure-le avant de le modifier.";

export function updateRefusal(
  equipment: { archived: boolean } | null,
): string | null {
  if (!equipment) return "Article introuvable.";
  return equipment.archived ? ARCHIVED_READ_ONLY_ERROR : null;
}

// archiveCategory exige qu'aucun article actif ne reste dans la catégorie :
// restaurer l'article seul recréerait cet état.
export function restoreRefusal(
  category: { archived: boolean; label: string } | null,
): string | null {
  return category?.archived
    ? `Restaure d'abord la catégorie « ${category.label} ».`
    : null;
}
