import "server-only";

import { db } from "@/lib/db";

// US-F — tranches de quotient familial (tarification solidaire SGDF).
// Le tarif effectif d'un jeune = tarif de base × coefficient de sa tranche.
// Sans tranche → coefficient 1.0 (tarif plein).

// Tarif effectif (en centimes) pour un coefficient en pour-mille donné.
export function bracketedPriceCents(
  baseCents: number,
  coefficientPermille: number | null | undefined,
): number {
  const permille = coefficientPermille ?? 1000;
  return Math.round((baseCents * permille) / 1000);
}

export interface BracketVM {
  id: string;
  name: string;
  coefficientPermille: number;
  order: number;
  memberCount: number;
}

// Toutes les tranches actives, ordonnées, avec le nombre de membres.
export async function listBrackets(): Promise<BracketVM[]> {
  const brackets = await db.socialBracket.findMany({
    where: { archived: false },
    orderBy: [{ order: "asc" }, { coefficientPermille: "asc" }],
    select: {
      id: true,
      name: true,
      coefficientPermille: true,
      order: true,
      _count: { select: { members: true } },
    },
  });
  return brackets.map((b) => ({
    id: b.id,
    name: b.name,
    coefficientPermille: b.coefficientPermille,
    order: b.order,
    memberCount: b._count.members,
  }));
}

// Coefficient en pour-mille par jeune, pour un ensemble d'IDs (1000 par défaut).
export async function getBracketPermilleForUsers(
  userIds: string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, socialBracket: { select: { coefficientPermille: true } } },
  });
  const out = new Map<string, number>();
  for (const u of users) {
    out.set(u.id, u.socialBracket?.coefficientPermille ?? 1000);
  }
  return out;
}
