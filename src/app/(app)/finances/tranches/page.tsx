import { notFound } from "next/navigation";

// QF masqué — décision groupe (pas d'exposition/collecte du quotient familial
// en UI pour l'instant), cf. DECISIONS.md. Code, schéma (`SocialBracket`) et
// Server Actions (`bracket-actions.ts`) conservés intacts ; seule cette page
// est désactivée côté présentation (404, pas de redirection — décision groupe).
export default async function BracketsPage() {
  notFound();
}
