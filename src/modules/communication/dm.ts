// US-C04 — utilitaires messagerie directe. La paire d'utilisateurs d'une
// conversation est rangée de façon canonique (le plus petit id en A) pour que
// (X,Y) et (Y,X) désignent la même conversation.

export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
