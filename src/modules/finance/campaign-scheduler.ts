import "server-only";

import { db } from "@/lib/db";
import { notifyMany } from "@/modules/notifications/notify";

import { formatEuros } from "./format";

// US-F03 — relances automatiques des cotisations en retard.
// Pour chaque campagne dont l'échéance est passée, on relance (in-app + email)
// les familles des jeunes non à jour, sauf ceux marqués « échelonnement
// convenu ». Une relance par jeune et par campagne (dédup `CampaignReminder`).

function hasRole(rolesJson: string, role: string): boolean {
  try {
    return (JSON.parse(rolesJson) as string[]).includes(role);
  } catch {
    return false;
  }
}

export async function sendCampaignReminders(): Promise<number> {
  const now = new Date();
  const campaigns = await db.campaign.findMany({
    where: { deadline: { not: null, lt: now } },
    select: { id: true, name: true, amountCents: true, unit: true },
  });
  if (campaigns.length === 0) return 0;

  let sent = 0;
  for (const c of campaigns) {
    const candidates = await db.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { contains: "SCOUT" },
        ...(c.unit ? { unit: c.unit } : {}),
      },
      select: { id: true, roles: true },
    });
    const jeunes = candidates
      .filter((u) => hasRole(u.roles, "SCOUT"))
      .map((u) => u.id);
    if (jeunes.length === 0) continue;

    const [payments, exemptions, reminders] = await Promise.all([
      db.campaignPayment.findMany({
        where: { campaignId: c.id, userId: { in: jeunes } },
        select: { userId: true, amountCents: true },
      }),
      db.campaignExemption.findMany({
        where: { campaignId: c.id },
        select: { userId: true },
      }),
      db.campaignReminder.findMany({
        where: { campaignId: c.id },
        select: { userId: true },
      }),
    ]);

    const paidBy = new Map<string, number>();
    for (const p of payments) {
      paidBy.set(p.userId, (paidBy.get(p.userId) ?? 0) + p.amountCents);
    }
    const exempt = new Set(exemptions.map((e) => e.userId));
    const reminded = new Set(reminders.map((r) => r.userId));

    const toRemind = jeunes.filter(
      (id) =>
        (paidBy.get(id) ?? 0) < c.amountCents &&
        !exempt.has(id) &&
        !reminded.has(id),
    );
    if (toRemind.length === 0) continue;

    const links = await db.familyLink.findMany({
      where: { childId: { in: toRemind } },
      select: { parentId: true, childId: true },
    });
    const parentsByChild = new Map<string, string[]>();
    for (const l of links) {
      const arr = parentsByChild.get(l.childId) ?? [];
      arr.push(l.parentId);
      parentsByChild.set(l.childId, arr);
    }

    for (const childId of toRemind) {
      // Anti-doublon : on enregistre la relance AVANT l'envoi.
      try {
        await db.campaignReminder.create({
          data: { campaignId: c.id, userId: childId },
        });
      } catch {
        continue;
      }
      const recipients = [
        ...new Set([childId, ...(parentsByChild.get(childId) ?? [])]),
      ];
      const due = c.amountCents - (paidBy.get(childId) ?? 0);
      await notifyMany(recipients, (userId) => ({
        userId,
        type: "CAMPAIGN_REMINDER",
        title: `Cotisation en attente : ${c.name}`,
        body: `Il reste ${formatEuros(due)} à régler.`,
        link: "/finances/cotisations",
        messageId: c.id,
      }));
      sent++;
    }
  }
  return sent;
}
