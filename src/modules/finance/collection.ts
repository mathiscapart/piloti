// #121 — agrégats d'encaissement (campagne de cotisation, inscriptions d'un
// événement). Le reste dû et le trop-perçu se calculent jeune par jeune, puis
// se somment : un trop-perçu chez l'un ne masque pas ce que doivent les
// autres. Pur (testé dans collection.test.ts).

export interface CollectionLine {
  expectedCents: number;
  paidCents: number;
}

export function summarizeCollection(lines: CollectionLine[]) {
  let collectedCents = 0;
  let expectedCents = 0;
  let remainingCents = 0;
  let overpaidCents = 0;
  for (const l of lines) {
    collectedCents += l.paidCents;
    expectedCents += l.expectedCents;
    remainingCents += Math.max(0, l.expectedCents - l.paidCents);
    overpaidCents += Math.max(0, l.paidCents - l.expectedCents);
  }
  return {
    collectedCents,
    expectedCents,
    remainingCents,
    overpaidCents,
    // Part de l'attendu effectivement couverte, trop-perçus exclus (≤ 100 %).
    pct:
      expectedCents > 0
        ? Math.round(((expectedCents - remainingCents) / expectedCents) * 100)
        : 0,
  };
}

// Part d'un nouveau paiement qui dépasse le reste dû du jeune.
export function overpaymentCents(
  expectedCents: number,
  paidCents: number,
  amountCents: number,
): number {
  return Math.max(0, paidCents + amountCents - Math.max(expectedCents, paidCents));
}
