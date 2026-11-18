// #80 — lien « Retour » de la fiche membre selon la page d'origine (`?from=`).
// Liste blanche stricte : jamais d'URL libre (pas de redirection ouverte).
const BACK_LINKS = {
  prets: { href: "/prets", label: "Retour aux prêts" },
  annuaire: { href: "/membres/annuaire", label: "Retour à l'annuaire" },
  presences: { href: "/planning/presences", label: "Retour aux présences" },
} as const;

export type MemberBackFrom = keyof typeof BACK_LINKS;

export function memberBackLink(from: string | string[] | undefined): {
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
