// Encodage des cellules CSV destinées à être ouvertes dans un tableur.
//
// Deux problèmes distincts, souvent confondus :
//   1. Échappement RFC 4180 — les guillemets, `;` et sauts de ligne doivent être
//      protégés, sinon la ligne se décale.
//   2. Injection de formules (CWE-1236) — Excel et LibreOffice ÉVALUENT toute
//      cellule commençant par `=`, `+`, `-`, `@` ou une tabulation. Un membre
//      qui se prénomme `=WEBSERVICE("http://…")` fait exfiltrer le contenu du
//      fichier à l'ouverture, chez le trésorier, hors de l'application.
//      L'échappement RFC 4180 ne protège PAS de ça : les guillemets délimitent
//      la cellule, le tableur évalue quand même ce qu'il y a dedans.
//
// On préfixe donc les caractères déclencheurs d'une apostrophe, convention que
// les tableurs interprètent comme « ceci est du texte ».

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * Encode une valeur en cellule CSV sûre : neutralise les formules puis échappe
 * selon RFC 4180. À utiliser pour TOUT champ dont le contenu vient de la base
 * (nom, commentaire, motif…) — pas pour les libellés issus de nos constantes.
 */
export function csvCell(value: string): string {
  const neutralized = FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}
