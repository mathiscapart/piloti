"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PAYMENT_METHODS, UNITS } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { resolveUnitAudience } from "@/modules/audience/unit-audience";
import { notifyMany } from "@/modules/notifications/notify";

import { formatEuros, parseAmountToCents } from "./format";

function parseDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

// US-F01 — créer une campagne de cotisation et notifier les familles.
export async function createCampaign(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "campaign.manage")) {
    return { error: "Réservé au trésorier." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { error: "Nom requis." };

  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null) return { error: "Montant invalide." };

  const unitRaw = String(formData.get("unit") ?? "").trim();
  const unit =
    unitRaw && (UNITS as readonly string[]).includes(unitRaw) ? unitRaw : null;

  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  let deadline: Date | null = null;
  if (deadlineRaw) {
    deadline = parseDate(deadlineRaw);
    if (!deadline) return { error: "Date limite invalide." };
  }

  const created = await withAudit(
    (tx) =>
      tx.campaign.create({
        data: { name, amountCents, unit, deadline, createdById: user.id },
      }),
    (c) => ({
      action: "CAMPAIGN_CREATED",
      userId: user.id,
      metadata: { campaignId: c.id, name, amountCents, unit },
    }),
  );

  // Lancement : notifie les familles (jeunes du périmètre + leurs parents).
  after(async () => {
    const audience = await resolveUnitAudience(unit);
    const recipients = [
      ...new Set([...audience.youthIds, ...audience.parentIds]),
    ].filter((id) => id !== user.id);
    if (recipients.length === 0) return;
    await notifyMany(recipients, (userId) => ({
      userId,
      type: "CAMPAIGN_LAUNCHED",
      title: `Cotisation : ${name}`,
      body: `Montant : ${formatEuros(amountCents)}.${
        deadline ? " Merci de régler avant la date limite." : ""
      }`,
      link: "/finances/cotisations",
      messageId: created.id,
    }));
  });

  redirect("/finances/cotisations?notice=campaign-created");
}

// US-F02 — enregistrer un paiement (total ou partiel) d'un jeune.
export async function recordPayment(
  campaignId: string,
  userId: string,
  amountStr: string,
  method: string,
  dateStr: string,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "campaign.manage")) {
    return { error: "Réservé au trésorier." };
  }

  const amountCents = parseAmountToCents(amountStr);
  if (amountCents === null) return { error: "Montant invalide." };
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return { error: "Mode de paiement invalide." };
  }
  const paidAt = parseDate(dateStr) ?? new Date();

  const [campaign, jeune] = await Promise.all([
    db.campaign.findUnique({ where: { id: campaignId }, select: { id: true } }),
    db.user.findUnique({ where: { id: userId }, select: { id: true } }),
  ]);
  if (!campaign || !jeune) return { error: "Campagne ou jeune introuvable." };

  await withAudit(
    (tx) =>
      tx.campaignPayment.create({
        data: {
          campaignId,
          userId,
          amountCents,
          method,
          paidAt,
          recordedById: actor.id,
        },
      }),
    {
      action: "CAMPAIGN_PAYMENT_RECORDED",
      userId: actor.id,
      metadata: { campaignId, userId, amountCents, method },
    },
  );

  revalidatePath(`/finances/cotisations/${campaignId}`);
  return { error: null };
}
