import "server-only";

import { db } from "@/lib/db";
import type { PaymentStatus } from "@/lib/enums";

// US-F01/F02 — campagnes de cotisation & suivi des paiements.

function hasRole(rolesJson: string, role: string): boolean {
  try {
    return (JSON.parse(rolesJson) as string[]).includes(role);
  } catch {
    return false;
  }
}

export async function listCampaigns() {
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
  });
  if (campaigns.length === 0) return [];

  const sums = await db.campaignPayment.groupBy({
    by: ["campaignId"],
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
    where: {
      status: "ACTIVE",
      roles: { contains: "SCOUT" },
      ...(campaign.unit ? { unit: campaign.unit } : {}),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, image: true, roles: true },
  });
  const jeunes = candidates.filter((u) => hasRole(u.roles, "SCOUT"));

  const [payments, exemptions, reminders] = await Promise.all([
    db.campaignPayment.findMany({
      where: { campaignId: id },
      select: { userId: true, amountCents: true },
    }),
    db.campaignExemption.findMany({
      where: { campaignId: id },
      select: { userId: true },
    }),
    db.campaignReminder.findMany({
      where: { campaignId: id },
      select: { userId: true },
    }),
  ]);
  const paidByUser = new Map<string, number>();
  for (const p of payments) {
    paidByUser.set(p.userId, (paidByUser.get(p.userId) ?? 0) + p.amountCents);
  }
  const exemptSet = new Set(exemptions.map((e) => e.userId));
  const remindedSet = new Set(reminders.map((r) => r.userId));

  const late = campaign.deadline != null && campaign.deadline < new Date();

  const rows = jeunes.map((j) => {
    const paid = paidByUser.get(j.id) ?? 0;
    let status: PaymentStatus;
    if (paid >= campaign.amountCents) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else status = late ? "LATE" : "PENDING";
    return {
      user: { id: j.id, firstName: j.firstName, lastName: j.lastName, image: j.image },
      paidCents: paid,
      status,
      exempt: exemptSet.has(j.id),
      reminded: remindedSet.has(j.id),
    };
  });

  const collected = payments.reduce((a, p) => a + p.amountCents, 0);
  const expectedTotal = campaign.amountCents * rows.length;

  return {
    campaign,
    rows,
    stats: {
      total: rows.length,
      paidCount: rows.filter((r) => r.status === "PAID").length,
      collectedCents: collected,
      expectedCents: expectedTotal,
      remainingCents: Math.max(0, expectedTotal - collected),
      pct: expectedTotal > 0 ? Math.round((collected / expectedTotal) * 100) : 0,
    },
  };
}

export type CampaignDetail = NonNullable<
  Awaited<ReturnType<typeof getCampaignDetail>>
>;
