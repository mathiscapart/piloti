import { db } from "@/lib/db";
import type { ReportStatus, ReportTargetType } from "@/lib/enums";
import { effectiveRoles } from "@/lib/permissions";

import { isVisibleMessage } from "./moderation-policy";

export type ReportStatusFilter = "PENDING" | "RESOLVED" | "DISMISSED" | "all";

interface QueueUser {
  role: string;
  roles?: string[] | string | null;
  unit?: string | null;
}

export interface ReportQueueEntry {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reporterId: string;
  reporterName: string;
  reason: string | null;
  status: ReportStatus;
  moderatorId: string | null;
  moderatorName: string | null;
  resolution: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  // null = le message a été supprimé/introuvable depuis (rare, defensive).
  target: {
    body: string;
    authorName: string;
    context: string;
    hidden: boolean;
  } | null;
}

// SAFE-02 — file de modération : signalements + aperçu du contenu visé
// (polymorphe, résolu en 2 requêtes groupées plutôt qu'une par signalement).
// Routage (raffinement SAFE-02) : un CHEF ne voit que les signalements de SON
// unité (`Report.concernedUnit`, l'unité de l'auteur du message visé) ; un
// signalement dont `concernedUnit` est null (auteur sans unité) lui reste
// invisible — fail-closed. L'ADMIN voit tout. Le RESPONSABLE_GROUPE (lecture
// seule, `moderation.view`) garde une vue globale, alignée sur le reste de
// l'appli où RG = lecture seule sur tout (arbitrage à confirmer, cf. la tâche).
export async function listReports(
  status: ReportStatusFilter = "PENDING",
  user: QueueUser,
): Promise<ReportQueueEntry[]> {
  const roles = effectiveRoles(user);
  const scopedToUnit = !roles.includes("ADMIN") && roles.includes("CHEF");
  if (scopedToUnit && !user.unit) return [];

  const reports = await db.report.findMany({
    where: {
      ...(status === "all" ? {} : { status }),
      ...(scopedToUnit ? { concernedUnit: user.unit } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { firstName: true, lastName: true } },
      moderator: { select: { firstName: true, lastName: true } },
    },
  });
  if (reports.length === 0) return [];

  const channelIds = reports
    .filter((r) => r.targetType === "CHANNEL_MESSAGE")
    .map((r) => r.targetId);
  const dmIds = reports
    .filter((r) => r.targetType === "DIRECT_MESSAGE")
    .map((r) => r.targetId);

  const [channelMessages, directMessages] = await Promise.all([
    channelIds.length > 0
      ? db.message.findMany({
          where: { id: { in: channelIds } },
          include: {
            author: { select: { firstName: true, lastName: true } },
            channel: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    dmIds.length > 0
      ? db.directMessage.findMany({
          where: { id: { in: dmIds } },
          include: { sender: { select: { firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
  ]);
  const messageById = new Map(channelMessages.map((m) => [m.id, m]));
  const dmById = new Map(directMessages.map((m) => [m.id, m]));

  return reports.map((r) => {
    let target: ReportQueueEntry["target"] = null;
    if (r.targetType === "CHANNEL_MESSAGE") {
      const m = messageById.get(r.targetId);
      if (m) {
        target = {
          body: m.body,
          authorName: `${m.author.firstName} ${m.author.lastName}`,
          context: `#${m.channel.name}`,
          hidden: !isVisibleMessage(m.hiddenAt),
        };
      }
    } else {
      const m = dmById.get(r.targetId);
      if (m) {
        target = {
          body: m.body,
          authorName: `${m.sender.firstName} ${m.sender.lastName}`,
          context: "Message privé",
          hidden: !isVisibleMessage(m.hiddenAt),
        };
      }
    }

    return {
      id: r.id,
      targetType: r.targetType as ReportTargetType,
      targetId: r.targetId,
      reporterId: r.reporterId,
      reporterName: `${r.reporter.firstName} ${r.reporter.lastName}`,
      reason: r.reason,
      status: r.status as ReportStatus,
      moderatorId: r.moderatorId,
      moderatorName: r.moderator ? `${r.moderator.firstName} ${r.moderator.lastName}` : null,
      resolution: r.resolution,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      target,
    };
  });
}
