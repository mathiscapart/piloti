import type { Prisma } from "@prisma/client";

import { ROLES, UNITS } from "@/lib/enums";

// Traduction des paramètres d'URL de /admin/utilisateurs en clause Prisma.
// Isolé de `queries.ts` pour rester une logique pure, testable sans instancier
// le client Prisma — ce fichier n'importe volontairement pas `@/lib/db`.

// Tris proposés dans l'administration des comptes. Le défaut ("status") garde
// l'ordre historique : suspendus après actifs, puis alphabétique.
export const USER_SORTS = [
  "status",
  "status_desc",
  "name",
  "name_desc",
  "unit",
  "unit_desc",
  "recent",
  "oldest",
] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface ManageableUserFilters {
  search?: string;
  // Rôle recherché parmi User.roles (rôle principal comme casquette).
  role?: string;
  unit?: string;
  // "ACTIVE" | "SUSPENDED" ; absent = les deux.
  status?: string;
  sort?: string;
}

const isRole = (value: string | undefined): value is string =>
  value !== undefined && (ROLES as readonly string[]).includes(value);

const isUnit = (value: string | undefined): value is string =>
  value !== undefined && (UNITS as readonly string[]).includes(value);

// Prisma traduit `contains` en `LIKE '%' || ? || '%'` : les caractères `%` et
// `_` présents dans le paramètre restent des jokers SQL. Une saisie « % » venue
// de l'URL ramènerait donc toute la table. On les neutralise — dans un nom ou un
// e-mail ils n'ont de toute façon aucun sens comme caractères recherchés.
const LIKE_WILDCARDS = /[%_]/g;

// Borne le coût d'une requête : chaque mot ajoute une sous-clause `OR` à la
// requête. Sans plafond, un `?q=` de plusieurs milliers de mots forgé à la main
// fabriquerait une requête arbitrairement lourde.
const MAX_SEARCH_WORDS = 8;

// Recherche libre sur un compte. `roles` étant un JSON sérialisé en TEXT (SQLite),
// on ne cherche que sur les champs texte simples.
//
// Chaque mot de la saisie doit matcher au moins un champ (AND de OR) : « marie
// dupont » retrouve le compte dont le prénom est Marie et le nom Dupont, dans
// n'importe quel ordre, là où une recherche sur la chaîne entière ne matcherait
// aucune colonne prise isolément.
function userSearchWhere(search: string): Prisma.UserWhereInput {
  const words = search
    .split(/\s+/)
    .map((word) => word.replace(LIKE_WILDCARDS, ""))
    .filter(Boolean)
    .slice(0, MAX_SEARCH_WORDS);
  if (words.length === 0) return {};
  return {
    // `contains` suffit : sur SQLite, LIKE est déjà insensible à la casse pour
    // l'ASCII, et `mode: "insensitive"` n'est pas supporté par ce provider.
    AND: words.map((word) => ({
      OR: [
        { firstName: { contains: word } },
        { lastName: { contains: word } },
        // US-CM-01 — l'e-mail d'un compte enfant sans connexion est technique et
        // masqué dans la liste : le rendre cherchable donnerait un résultat que
        // l'admin ne pourrait pas relier à ce qu'il voit à l'écran.
        { canLogin: true, email: { contains: word } },
      ],
    })),
  };
}

// Traduit les filtres d'URL en clause Prisma. Fonction pure et exportée pour
// être testée : c'est ici que se joue le fait qu'un paramètre forgé à la main ne
// puisse pas élargir le périmètre de la liste.
export function buildManageableUserWhere(
  filters: ManageableUserFilters = {},
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    // Le garde-fou important : /admin/utilisateurs ne montre jamais les comptes
    // PENDING ni REJECTED (ils vivent dans /admin/inscriptions). Un `?status=`
    // inconnu retombe sur les deux états autorisés au lieu d'être transmis.
    status:
      filters.status === "ACTIVE" || filters.status === "SUSPENDED"
        ? filters.status
        : { in: ["ACTIVE", "SUSPENDED"] },
  };
  const search = filters.search?.trim();
  if (search) Object.assign(where, userSearchWhere(search));
  // Tout ce qui vient de l'URL passe par une liste blanche avant d'atteindre la
  // requête, au même titre que `status` et `sort` : une valeur inconnue est
  // ignorée plutôt qu'interpolée.
  if (isRole(filters.role)) {
    // Les guillemets encadrent la valeur pour coller au JSON stocké et éviter
    // qu'un rôle soit le préfixe d'un autre.
    where.roles = { contains: `"${filters.role}"` };
  }
  if (isUnit(filters.unit)) where.unit = filters.unit;
  return where;
}

// Idem pour le tri : une clé inconnue ne doit pas atteindre l'`orderBy` Prisma.
export function resolveUserSort(sort: string | undefined): UserSort {
  return (USER_SORTS as readonly string[]).includes(sort ?? "")
    ? (sort as UserSort)
    : "status";
}
