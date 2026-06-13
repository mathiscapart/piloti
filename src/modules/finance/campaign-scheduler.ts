import "server-only";

import { db } from "@/lib/db";
import { notifyMany } from "@/modules/notifications/notify";

import { formatEuros } from "./format";
import { computeTiers } from "./tiers";

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TEMPLATE =
  "Cotisation {campagne} : il reste {reste} à régler. Merci de régulariser.";

function parseDays(json: string): number[] {
  try {
    const arr = JSON.parse(json) as unknown[];
    return [...new Set(arr.map(Number).filter((n) => Number.isFinite(n) && n >= 0))].sort(
      (a, b) => a - b,
    );
  } catch {
    return [7, 15, 30];
  }
}

function fillTemplate(tpl: string, vars: { campagne: string; reste: string }): string {
  return tpl
    .replaceAll("{campagne}", vars.campagne)
    .replaceAll("{reste}", vars.reste);
}

export async function sendCampaignReminders(): Promise<number> {
  const now = new Date();
  const campaigns = await db.campaign.findMany({
    where: { deadline: { not: null, lt: now } },
    select: {
      id: true,
      name: true,
      amountCents: true,
      secondChildCents: true,
      socialCents: true,
      unit: true,
      deadline: true,
      reminderDaysJson: true,
      reminderTemplate: true,
    },
  });
  if (campaigns.length === 0) return 0;

  let sent = 0;
  for (const c of campaigns) {
    if (!c.deadline) continue;
    // Étapes de cadence échues : échéance + N jours <= maintenant.
    const dueOffsets = parseDays(c.reminderDaysJson).filter(
      (d) => c.deadline!.getTime() + d * ONE_DAY_MS <= now.getTime(),
    );
    if (dueOffsets.length === 0) continue;

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

    const [payments, exemptions, reminders, links, socialCases] = await Promise.all([
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
        select: { userId: true, dayOffset: true },
      }),
      db.familyLink.findMany({
        where: { childId: { in: jeunes } },
        select: { parentId: true, childId: true },
      }),
      db.campaignSocialCase.findMany({
        where: { campaignId: c.id },
        select: { userId: true },
      }),
    ]);

    const paidBy = new Map<string, number>();
    for (const p of payments) {
      paidBy.set(p.userId, (paidBy.get(p.userId) ?? 0) + p.amountCents);
    }
    const tiers = computeTiers(c, jeunes, links, new Set(socialCases.map((s) => s.userId)));
    const exempt = new Set(exemptions.map((e) => e.userId));
    const remindedAt = new Set(reminders.map((r) => `${r.userId}:${r.dayOffset}`));
    const parentsByChild = new Map<string, string[]>();
    for (const l of links) {
      const arr = parentsByChild.get(l.childId) ?? [];
      arr.push(l.parentId);
      parentsByChild.set(l.childId, arr);
    }
    const template = c.reminderTemplate?.trim() || DEFAULT_TEMPLATE;

    // On envoie pour la cadence la PLUS AVANCÉE due et non encore envoyée à ce
    // jeune (évite d'envoyer 3 relances d'un coup la première fois).
    for (const childId of jeunes) {
      if (exempt.has(childId)) continue;
      const expected = tiers.get(childId)?.expectedCents ?? c.amountCents;
      const due = expected - (paidBy.get(childId) ?? 0);
      if (due <= 0) continue;

      const offset = [...dueOffsets]
        .reverse()
        .find((d) => !remindedAt.has(`${childId}:${d}`));
      if (offset === undefined) continue;

      try {
        await db.campaignReminder.create({
          data: { campaignId: c.id, userId: childId, dayOffset: offset },
        });
      } catch {
        continue;
      }
      const recipients = [
        ...new Set([childId, ...(parentsByChild.get(childId) ?? [])]),
      ];
      const body = fillTemplate(template, {
        campagne: c.name,
        reste: formatEuros(due),
      });
      await notifyMany(recipients, (userId) => ({
        userId,
        type: "CAMPAIGN_REMINDER",
        title: `Cotisation en attente : ${c.name}`,
        body,
        link: "/finances/cotisations",
        messageId: c.id,
      }));
      sent++;
    }
  }
  return sent;
}
