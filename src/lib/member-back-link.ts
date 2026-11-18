// #80 — lien « Retour » de la fiche membre selon la page d'origine (`?from=`).
// Liste blanche stricte : jamais d'URL libre (pas de redirection ouverte).
const BACK_LINKS = {
  prets: { href: "/prets", label: "Retour aux prêts" },
  annuaire: { href: "/membres/annuaire", label: "Retour à l'annuaire" },
  presences: { href: "/planning/presences", label: "Retour aux présences" },
  dashboard: { href: "/dashboard", label: "Retour au tableau de bord" },
} as const;

export type MemberBackFrom = keyof typeof BACK_LINKS;

export function memberBackLink(from: unknown): {
  from: MemberBackFrom | null;
  href: string;
  label: string;
} {
  if (typeof from === "string" && Object.hasOwn(BACK_LINKS, from)) {
    const key = from as MemberBackFrom;
    return { from: key, ...BACK_LINKS[key] };
  }
  return { from: null, href: "/membres", label: "Retour aux membres" };
}

/** `?from=<clé>` à propager sur un lien interne, ou chaîne vide. */
export function memberBackQuery(from: MemberBackFrom | null): string {
  return from ? `?from=${from}` : "";
}

/**
 * #66 — destination après enregistrement d'un profil membre : la page
 * d'origine (liste blanche uniquement) avec le message de succès.
 */
export function memberProfileRedirect(from: unknown): string {
  return `${memberBackLink(from).href}?notice=member-profile-updated`;
}
