"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { REPORT_TARGET_TYPES, type ReportTargetType } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { publishChannelEvent, publishUserEvent } from "@/lib/realtime";
import type { ActionResult } from "@/lib/types";
import { notify, notifyMany } from "@/modules/notifications/notify";

import { canAccessChannel } from "./access";
import { canModerateReport, resolveConcernedUnit, selectReportRecipients } from "./moderation-policy";

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

// SAFE-02 — signale un message (salon ou DM) aux modérateurs. Ouvert à tout
// compte ACTIVE (pas de permission dédiée : signaler n'est pas une action
// privilégiée) — mais réservé à ceux qui ont accès au message visé, pour ne
// pas servir d'oracle d'existence sur des contenus inaccessibles.
export async function reportMessage(
  targetType: ReportTargetType,
  targetId: string,
  reason?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = reportSchema.safeParse({ targetType, targetId, reason });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  // Routage (raffinement SAFE-02) : l'unité concernée = celle de l'auteur du
  // message visé, figée sur le signalement pour router/filtrer la file sans
  // re-résoudre l'auteur à chaque lecture (cf. Report.concernedUnit).
  let concernedUnit: string | null = null;

  if (parsed.data.targetType === "CHANNEL_MESSAGE") {
    const message = await db.message.findUnique({
      where: { id: parsed.data.targetId },
      select: { channel: true, author: { select: { unit: true } } },
    });
    if (!message) return { error: "Message introuvable." };
    if (!canAccessChannel(user, message.channel)) {
      return { error: "Accès refusé." };
    }
    concernedUnit = resolveConcernedUnit(message.author);
  } else {
    const dm = await db.directMessage.findUnique({
      where: { id: parsed.data.targetId },
      select: {
        conversation: { select: { userAId: true, userBId: true } },
        sender: { select: { unit: true } },
      },
    });
    if (!dm) return { error: "Message introuvable." };
    if (dm.conversation.userAId !== user.id && dm.conversation.userBId !== user.id) {
      return { error: "Accès refusé." };
    }
    concernedUnit = resolveConcernedUnit(dm.sender);
  }

  // Pas de doublon : un signalement déjà en attente sur le même contenu par le
  // même compte n'a pas besoin d'être répété.
  const existing = await db.report.findFirst({
    where: {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reporterId: user.id,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (existing) return { error: "Tu as déjà signalé ce message." };

  await withAudit(
    (tx) =>
      tx.report.create({
        data: {
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          reporterId: user.id,
          reason: parsed.data.reason ?? null,
          concernedUnit,
        },
      }),
    {
      action: "MESSAGE_REPORTED",
      userId: user.id,
      metadata: { targetType: parsed.data.targetType, targetId: parsed.data.targetId },
    },
  );

  after(() => notifyModerators(concernedUnit, parsed.data.reason));

  return { error: null };
}

// Notifie à la CRÉATION du signalement les modérateurs concernés : tous les
// ADMIN + les CHEF de l'unité de l'auteur du message visé (pas tous les
// chefs — cf. `selectReportRecipients`). Le signalant n'est notifié qu'à la
// clôture (cf. `closeReport`), pas ici.
async function notifyModerators(concernedUnit: string | null, reason?: string): Promise<void> {
  const candidates = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true, roles: true, unit: true },
  });
  const recipients = selectReportRecipients(candidates, concernedUnit);
  if (recipients.length === 0) return;

  await notifyMany(recipients, (userId) => ({
    userId,
    type: "REPORT_CREATED",
    title: "Nouveau signalement",
    body: reason ? `Motif : ${reason}` : "Un message a été signalé, à traiter.",
    link: "/moderation",
  }));
}

// Masque le message visé (soft-hide, jamais de suppression en dur : garde la
// trace pour la modération). Réservé à `moderation.review` ET, en plus, à
// l'ADMIN ou au CHEF de l'unité concernée par le signalement (routage SAFE-02,
// cf. `canModerateReport`) — un chef ne doit pas pouvoir masquer un message
// signalé dans une autre unité. Idempotent : si déjà masqué, ne fait rien.
export async function hideMessage(
  reportId: string,
  targetType: ReportTargetType,
  targetId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "moderation.review")) {
    return { error: "Réservé aux chefs." };
  }

  const report = await db.report.findUnique({
    where: { id: reportId },
    select: { concernedUnit: true },
  });
  if (!report) return { error: "Signalement introuvable." };
  if (!canModerateReport(user, report)) {
    return { error: "Réservé aux modérateurs de cette unité." };
  }

  if (targetType === "CHANNEL_MESSAGE") {
    const message = await db.message.findUnique({
      where: { id: targetId },
      select: { channelId: true, hiddenAt: true },
    });
    if (!message) return { error: "Message introuvable." };
    if (message.hiddenAt) return { error: null };

    await withAudit(
      (tx) =>
        tx.message.update({
          where: { id: targetId },
          data: { hiddenAt: new Date(), hiddenById: user.id },
        }),
      { action: "MESSAGE_HIDDEN", userId: user.id, metadata: { targetType, targetId } },
    );
    publishChannelEvent({
      type: "delete",
      channelId: message.channelId,
      payload: { messageId: targetId },
    });
  } else {
    const dm = await db.directMessage.findUnique({
      where: { id: targetId },
      select: {
        hiddenAt: true,
        conversation: { select: { userAId: true, userBId: true } },
      },
    });
    if (!dm) return { error: "Message introuvable." };
    if (dm.hiddenAt) return { error: null };

    await withAudit(
      (tx) =>
        tx.directMessage.update({
          where: { id: targetId },
          data: { hiddenAt: new Date(), hiddenById: user.id },
        }),
      { action: "MESSAGE_HIDDEN", userId: user.id, metadata: { targetType, targetId } },
    );
    publishUserEvent(dm.conversation.userAId, { type: "dm", payload: { moderated: true } });
    publishUserEvent(dm.conversation.userBId, { type: "dm", payload: { moderated: true } });
  }

  revalidatePath("/moderation");
  return { error: null };
}

// Lien de retour vers le contexte du contenu signalé, pour la notification au
// signalant (`/moderation` lui serait souvent inaccessible : la consultation
// est réservée aux chefs et RG, pas à tout signalant).
async function resolveTargetLink(
  targetType: ReportTargetType,
  targetId: string,
  reporterId: string,
): Promise<string> {
  if (targetType === "CHANNEL_MESSAGE") {
    const message = await db.message.findUnique({
      where: { id: targetId },
      select: { channel: { select: { slug: true } } },
    });
    return message ? `/communication/${message.channel.slug}` : "/communication";
  }
  const dm = await db.directMessage.findUnique({
    where: { id: targetId },
    select: { conversation: { select: { userAId: true, userBId: true } } },
  });
  if (!dm) return "/messages";
  const otherId =
    dm.conversation.userAId === reporterId ? dm.conversation.userBId : dm.conversation.userAId;
  return `/messages/${otherId}`;
}

async function closeReport(
  reportId: string,
  status: "RESOLVED" | "DISMISSED",
  resolution: string | undefined,
  moderator: Awaited<ReturnType<typeof getCurrentUser>>,
): Promise<ActionResult> {
  const report = await db.report.findUnique({ where: { id: reportId } });
  if (!report) return { error: "Signalement introuvable." };
  if (report.status !== "PENDING") {
    return { error: "Ce signalement a déjà été traité." };
  }
  // Routage SAFE-02 : un CHEF ne traite que les signalements de son unité ;
  // l'ADMIN traite tout (cf. `canModerateReport`).
  if (!canModerateReport(moderator, report)) {
    return { error: "Réservé aux modérateurs de cette unité." };
  }

  await withAudit(
    (tx) =>
      tx.report.update({
        where: { id: reportId },
        data: {
          status,
          moderatorId: moderator.id,
          resolution: resolution ?? null,
          resolvedAt: new Date(),
        },
      }),
    {
      action: status === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_DISMISSED",
      userId: moderator.id,
      metadata: { reportId, targetType: report.targetType, targetId: report.targetId },
    },
  );

  const link = await resolveTargetLink(
    report.targetType as ReportTargetType,
    report.targetId,
    report.reporterId,
  );
  after(() =>
    notify({
      userId: report.reporterId,
      type: "REPORT_UPDATE",
      title: status === "RESOLVED" ? "Signalement traité" : "Signalement rejeté",
      body:
        status === "RESOLVED"
          ? "Ton signalement a été examiné et une action a été prise."
          : "Ton signalement a été examiné, aucune action n'a été jugée nécessaire.",
      link,
    }),
  );

  revalidatePath("/moderation");
  return { error: null };
}

// Marque le signalement comme résolu (une action a été prise — typiquement
// après avoir masqué le message visé via `hideMessage`).
export async function resolveReport(
  reportId: string,
  resolution?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "moderation.review")) {
    return { error: "Réservé aux chefs." };
  }
  return closeReport(reportId, "RESOLVED", resolution?.trim() || undefined, user);
}

// Rejette le signalement (pas de violation constatée), sans toucher au message.
export async function dismissReport(
  reportId: string,
  resolution?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "moderation.review")) {
    return { error: "Réservé aux chefs." };
  }
  return closeReport(reportId, "DISMISSED", resolution?.trim() || undefined, user);
}
