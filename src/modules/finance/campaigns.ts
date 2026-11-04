import "server-only";

import { wallNow } from "@/lib/datetime";
import { db } from "@/lib/db";
import type { PaymentStatus } from "@/lib/enums";

import { summarizeCollection } from "./collection";
import { familyDues, type FamilyDue } from "./family-dues";
import { campaignPopulationWhere, isInCampaignPopulation } from "./population";
import { computeTiers } from "./tiers";

// US-F01/F02 — campagnes de cotisation & suivi des paiements.

export async function listCampaigns() {
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
  });
  if (campaigns.length === 0) return [];

  const sums = await db.campaignPayment.groupBy({
    by: ["campaignId"],
    where: { cancelledAt: null },
    _sum: { amountCents: true },
  });
  const collected = new Map(
    sums.map((s) => [s.campaignId, s._sum.amountCents ?? 0]),
  );

  return campaigns.map((c) => ({
    ...c,
    collectedCents: collected.get(c.id) ?? 0,
  }));
}

export type CampaignListItem = Awaited<ReturnType<typeof listCampaigns>>[number];

// Détail : campagne + statut de chaque jeune du périmètre + indicateurs.
export async function getCampaignDetail(id: string) {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) return null;

  const candidates = await db.user.findMany({
    where: campaignPopulationWhere(campaign.unit),
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      image: true,
      status: true,
      roles: true,
      unit: true,
      socialBracket: { select: { coefficientPermille: true } },
    },
  });
  const jeunes = candidates.filter((u) => isInCampaignPopulation(campaign, u));

  const jeuneIds = jeunes.map((j) => j.id);
  const [payments, exemptions, reminders, socialCases, links] = await Promise.all([
    // Annulés compris : ils restent visibles dans l'historique du jeune (#121).
    db.campaignPayment.findMany({
      where: { campaignId: id },
      orderBy: { paidAt: "asc" },
      select: {
        id: true,
        userId: true,
        amountCents: true,
        method: true,
        paidAt: true,
        cancelledAt: true,
        cancelReason: true,
      },
    }),
    db.campaignExemption.findMany({
      where: { campaignId: id },
      select: { userId: true },
    }),
    db.campaignReminder.findMany({
      where: { campaignId: id },
      select: { userId: true },
    }),
    db.campaignSocialCase.findMany({
      where: { campaignId: id },
      select: { userId: true },
    }),
    jeuneIds.length
      ? db.familyLink.findMany({
          where: { childId: { in: jeuneIds } },
          select: { parentId: true, childId: true },
        })
      : Promise.resolve([]),
  ]);
  const paidByUser = new Map<string, number>();
  const paymentsByUser = new Map<string, typeof payments>();
  for (const p of payments) {
    if (!paymentsByUser.has(p.userId)) paymentsByUser.set(p.userId, []);
    paymentsByUser.get(p.userId)!.push(p);
    if (p.cancelledAt) continue;
    paidByUser.set(p.userId, (paidByUser.get(p.userId) ?? 0) + p.amountCents);
  }
  const exemptSet = new Set(exemptions.map((e) => e.userId));
  const remindedSet = new Set(reminders.map((r) => r.userId));
  const socialSet = new Set(socialCases.map((s) => s.userId));
  // US-F — pondération par tranche de quotient familial (globale).
  const permilleByUser = new Map(
    jeunes.map((j) => [j.id, j.socialBracket?.coefficientPermille ?? 1000]),
  );

  // US-F01 — montant attendu par jeune (tarif différencié × tranche QF).
  const tiers = computeTiers(campaign, jeuneIds, links, socialSet, permilleByUser);

  const late = campaign.deadline != null && campaign.deadline < wallNow(); // échéance murale (saisie)

  const rows = jeunes.map((j) => {
    const paid = paidByUser.get(j.id) ?? 0;
    const expected = tiers.get(j.id)?.expectedCents ?? campaign.amountCents;
    let status: PaymentStatus;
    if (paid >= expected) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else status = late ? "LATE" : "PENDING";
    return {
      user: { id: j.id, firstName: j.firstName, lastName: j.lastName, image: j.image },
      paidCents: paid,
      expectedCents: expected,
      tier: tiers.get(j.id)?.tier ?? "FIRST",
      status,
      exempt: exemptSet.has(j.id),
      reminded: remindedSet.has(j.id),
      payments: paymentsByUser.get(j.id) ?? [],
    };
  });

  return {
    campaign,
    rows,
    stats: {
      total: rows.length,
      paidCount: rows.filter((r) => r.status === "PAID").length,
      // #121 — reste et trop-perçu calculés jeune par jeune.
      ...summarizeCollection(
        rows.map((r) => ({ expectedCents: r.expectedCents, paidCents: r.paidCents })),
      ),
      // Encaissé : tous les paiements non annulés, y compris ceux d'un jeune
      // sorti de la liste (inactif, changé d'unité) — même total que la liste
      // des campagnes et le tableau de bord.
      collectedCents: payments.reduce(
        (sum, p) => (p.cancelledAt ? sum : sum + p.amountCents),
        0,
      ),
    },
  };
}

export type CampaignDetail = NonNullable<
  Awaited<ReturnType<typeof getCampaignDetail>>
>;

// #106 — reste dû du compte connecté et des enfants qui lui sont rattachés,
// pour son tableau de bord. Seules les campagnes dont la population (même
// règle que le suivi) contient un membre de la famille sont chargées ; le
// filtrage par famille est fait par `familyDues`.
export async function getFamilyDues(viewerId: string): Promise<FamilyDue[]> {
  const links = await db.familyLink.findMany({
    where: { parentId: viewerId },
    select: { childId: true },
  });
  const childIds = links.map((l) => l.childId);
  const [family, campaigns] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [viewerId, ...childIds] } },
      select: { status: true, roles: true, unit: true },
    }),
    db.campaign.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, unit: true },
    }),
  ]);
  const relevant = campaigns.filter((c) =>
    family.some((u) => isInCampaignPopulation(c, u)),
  );
  if (relevant.length === 0) return [];

  const details = await Promise.all(relevant.map((c) => getCampaignDetail(c.id)));
  return familyDues(
    viewerId,
    childIds,
    details
      .filter((d) => d !== null)
      .map((d) => ({ id: d.campaign.id, name: d.campaign.name, rows: d.rows })),
  );
}
