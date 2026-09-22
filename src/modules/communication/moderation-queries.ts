import { db } from "@/lib/db";
import type { ReportStatus, ReportTargetType } from "@/lib/enums";
import type { CurrentUser } from "@/lib/get-current-user";

import {
  canModerateReport,
  isGroupWideModerator,
  isVisibleMessage,
  parseTargetSnapshot,
  reportTargetState,
  type ReportTargetState,
} from "./moderation-policy";

export type ReportStatusFilter = "PENDING" | "RESOLVED" | "DISMISSED" | "all";

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
  // #92 — copie prise au signalement (preuve de référence). null pour un
  // signalement antérieur à la copie. `backfilled` : copie remplie après coup
  // par migration (#150), pas prise au moment du signalement.
  snapshot: { body: string; authorName: string; backfilled: boolean } | null;
  // État du message actuel par rapport à la copie ; null sans copie.
  targetState: ReportTargetState | null;
  // Message actuel. null = supprimé depuis (par son auteur, cf. #92).
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
// invisible — fail-closed. L'ADMIN et le RESPONSABLE_GROUPE voient tout le
// groupe.
// #91 : un signalement visant un contenu de `user` lui est toujours masqué —
// il y verrait le signalant.
// #150 : la file applique `canModerateReport`, la règle des actions — un RG
// également CHEF n'est pas borné à son unité, et un signalement dont l'auteur
// est indéterminable reste invisible d'un CHEF.
export async function listReports(
  status: ReportStatusFilter = "PENDING",
  user: CurrentUser,
): Promise<ReportQueueEntry[]> {
  const scopedToUnit = !isGroupWideModerator(user);
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

  const snapshotById = new Map(reports.map((r) => [r.id, parseTargetSnapshot(r.targetSnapshot)]));
  // Nom de l'auteur résolu à la lecture, jamais copié : un compte anonymisé
  // apparaît anonymisé ici aussi.
  const snapshotAuthorIds = [
    ...new Set([...snapshotById.values()].flatMap((s) => (s ? [s.authorId] : []))),
  ];
  const snapshotAuthors =
    snapshotAuthorIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: snapshotAuthorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
  const authorNameById = new Map(
    snapshotAuthors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]),
  );

  // Auteur lu dans la copie d'abord : le message a pu être supprimé depuis.
  const authorIdOf = (r: (typeof reports)[number]): string | null =>
    snapshotById.get(r.id)?.authorId ??
    (r.targetType === "CHANNEL_MESSAGE"
      ? messageById.get(r.targetId)?.authorId
      : dmById.get(r.targetId)?.senderId) ??
    null;

  const visible = reports.filter((r) =>
    canModerateReport(user, { concernedUnit: r.concernedUnit, targetAuthorId: authorIdOf(r) }),
  );
  return visible.map((r) => {
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

    const rawSnapshot = snapshotById.get(r.id) ?? null;
    const snapshot = rawSnapshot
      ? {
          body: rawSnapshot.body,
          authorName: authorNameById.get(rawSnapshot.authorId) ?? "Compte inconnu",
          backfilled: rawSnapshot.backfilled === true,
        }
      : null;

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
      snapshot,
      targetState: reportTargetState(rawSnapshot, target),
      target,
    };
  });
}
