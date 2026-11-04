// #106 — reste dû d'une famille, affiché sur son tableau de bord. Pur : reçoit
// les lignes des campagnes (`getCampaignDetail`, donc la population de
// population.ts) et ne garde QUE celles du compte connecté et des enfants qui
// lui sont rattachés (FamilyLink). Jamais le statut d'une autre famille.

import { formatEuros } from "./format";

export interface DueCampaign {
  id: string;
  name: string;
  rows: {
    user: { id: string; firstName: string };
    expectedCents: number;
    paidCents: number;
    /** « Échelonnement convenu » : relances suspendues, le reste reste dû. */
    exempt: boolean;
  }[];
}

export interface FamilyDue {
  campaignId: string;
  campaignName: string;
  userId: string;
  /** Prénom, seulement quand plusieurs personnes de la famille sont concernées. */
  firstName: string | null;
  remainingCents: number;
  exempt: boolean;
}

export function familyDues(
  viewerId: string,
  childIds: string[],
  campaigns: DueCampaign[],
): FamilyDue[] {
  const family = new Set([viewerId, ...childIds]);
  const own = campaigns.map((c) => ({
    c,
    rows: c.rows.filter((r) => family.has(r.user.id)),
  }));
  // Le prénom ne sert qu'à distinguer : visible dès que la famille compte plus
  // d'une personne dans les campagnes, même si une seule doit encore payer.
  const people = new Set(own.flatMap(({ rows }) => rows.map((r) => r.user.id)));
  const showName = people.size > 1;

  return own.flatMap(({ c, rows }) =>
    rows
      .filter((r) => r.expectedCents - r.paidCents > 0)
      .map((r) => ({
        campaignId: c.id,
        campaignName: c.name,
        userId: r.user.id,
        firstName: showName ? r.user.firstName : null,
        remainingCents: r.expectedCents - r.paidCents,
        exempt: r.exempt,
      })),
  );
}

// « Cotisation <campagne> : reste X € ». Les campagnes s'appellent souvent
// déjà « Cotisation 2026-2027 » : on ne double pas le mot.
export function dueLabel(due: FamilyDue): string {
  const name = /^cotisation\b/i.test(due.campaignName)
    ? due.campaignName
    : `Cotisation ${due.campaignName}`;
  const who = due.firstName ? ` (${due.firstName})` : "";
  const note = due.exempt ? " — échelonnement convenu" : "";
  return `${name}${who} : reste ${formatEuros(due.remainingCents)}${note}`;
}
