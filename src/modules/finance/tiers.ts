// US-F01 — montant attendu par jeune selon les tarifs différenciés.
// 1er enfant = `amountCents` ; 2e enfant et + = `secondChildCents` (via les
// liens familiaux) ; « cas social » = `socialCents`. Le montant ainsi obtenu
// est ensuite pondéré par la tranche de quotient familial (globale) du jeune,
// via `permilleByUser` (1000 = ×1.0 par défaut). Pur (réutilisé par la requête
// de détail et le scheduler de relances).

export interface TierCampaign {
  amountCents: number;
  secondChildCents: number | null;
  socialCents: number | null;
}

export type Tier = "FIRST" | "SECOND" | "SOCIAL";

export function computeTiers(
  campaign: TierCampaign,
  jeuneIds: string[],
  links: { parentId: string; childId: string }[],
  socialSet: Set<string>,
  permilleByUser?: Map<string, number>,
): Map<string, { expectedCents: number; tier: Tier }> {
  const weighted = (cents: number, userId: string): number => {
    const permille = permilleByUser?.get(userId) ?? 1000;
    return Math.round((cents * permille) / 1000);
  };
  const perimeter = new Set(jeuneIds);
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, Set<string>>();
  for (const l of links) {
    if (!childrenOf.has(l.parentId)) childrenOf.set(l.parentId, []);
    childrenOf.get(l.parentId)!.push(l.childId);
    if (!parentsOf.has(l.childId)) parentsOf.set(l.childId, new Set());
    parentsOf.get(l.childId)!.add(l.parentId);
  }

  const out = new Map<string, { expectedCents: number; tier: Tier }>();
  for (const id of jeuneIds) {
    if (socialSet.has(id)) {
      // « Cas social » manuel : montant pinné, non pondéré par la tranche.
      out.set(id, {
        expectedCents: campaign.socialCents ?? campaign.amountCents,
        tier: "SOCIAL",
      });
      continue;
    }
    // 2e enfant et + : a un frère/sœur « avant » lui dans le périmètre.
    let isSecond = false;
    const parents = parentsOf.get(id);
    if (parents) {
      const family = new Set<string>();
      for (const p of parents) {
        for (const c of childrenOf.get(p) ?? []) {
          if (perimeter.has(c)) family.add(c);
        }
      }
      if (family.size > 1) {
        isSecond = [...family].sort().indexOf(id) > 0;
      }
    }
    const base = isSecond
      ? (campaign.secondChildCents ?? campaign.amountCents)
      : campaign.amountCents;
    out.set(id, {
      expectedCents: weighted(base, id),
      tier: isSecond ? "SECOND" : "FIRST",
    });
  }
  return out;
}
