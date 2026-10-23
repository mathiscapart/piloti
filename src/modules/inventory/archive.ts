// Issue #110 — règles d'archivage d'un article. Un article archivé est en
// lecture seule (on le restaure pour le modifier) et ne s'archive pas tant
// qu'un prêt est actif : le prêt en cours pointerait vers un article masqué.

import { can } from "@/lib/permissions";

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

// Filtre « Archivés » de /stock (`?archived=1`) : le paramètre n'a d'effet que
// pour qui détient `equipment.archived.view` (ADMIN) ; sinon il est ignoré.
export function showArchived(
  user: Parameters<typeof can>[0],
  archivedParam: string | undefined,
): boolean {
  return archivedParam === "1" && can(user, "equipment.archived.view");
}
