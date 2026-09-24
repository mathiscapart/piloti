import "server-only";

import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import {
  MESSAGE_TEXT_ACTIONS,
  MESSAGE_TEXT_RETENTION_YEARS,
  auditRetentionYears,
  retentionCutoff,
  stripExpiredMessageText,
} from "@/lib/audit-retention";

// #163 — conservation du journal d'audit, exécutée par le scheduler (cf.
// src/lib/scheduler.ts), sur le modèle de `rejected-purge.ts` :
//   1. le texte des messages de salon est retiré des lignes de plus d'1 an ;
//   2. les lignes plus anciennes que AUDIT_RETENTION_YEARS sont supprimées.
// Chaque lot est une transaction `withAudit` qui laisse une ligne
// récapitulative (nombre de lignes, date seuil) : le journal garde la trace de
// ce qui lui a été retiré.

// Lots bornés : au premier passage, tout l'historique ancien est traité d'un
// coup ; on ne veut pas d'une transaction SQLite géante qui bloquerait les
// écritures de l'app. Le filtre sur `createdAt` est indexé.
const BATCH_SIZE = 500;

// LIMITE CONNUE (cf. D-032) — `AuditLog.userId` est obligatoire et il n'existe
// pas d'acteur système. La ligne récapitulative est attribuée au plus ancien
// compte ADMIN (celui du /setup) et `metadata.actor` dit qui a réellement agi.
// Sans ADMIN (base pas encore initialisée), on ne purge pas : aucune mutation
// sans trace.
async function schedulerActorId(): Promise<string | null> {
  const admin = await db.user.findFirst({
    // `roles` porte les droits réels ; `role` n'est qu'un miroir d'affichage.
    where: { roles: { contains: '"ADMIN"' }, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  // La purge ne tourne plus : sans ce signal, l'instance s'écarterait en
  // silence des durées publiées dans /confidentialite.
  if (!admin) console.warn("[scheduler] aucun ADMIN actif : conservation du journal d'audit suspendue.");
  return admin?.id ?? null;
}

/** Retire le texte des messages des lignes d'audit expirées. Retourne le nombre de lignes expurgées. */
export async function redactExpiredMessageText(now: Date = new Date()): Promise<number> {
  const cutoff = retentionCutoff(MESSAGE_TEXT_RETENTION_YEARS, now);
  const actorId = await schedulerActorId();
  if (!actorId) return 0;

  let redacted = 0;
  let cursor: string | undefined;
  for (;;) {
    // Pagination par curseur : une ligne sélectionnée mais sans texte à retirer
    // (JSON invalide, clé présente dans une valeur) ne bloque pas la boucle. Le
    // filtre `contains` écarte en SQL les lignes déjà expurgées, pour ne pas
    // les relire à chaque passage.
    const rows = await db.auditLog.findMany({
      where: {
        OR: MESSAGE_TEXT_ACTIONS.map(({ action, key }) => ({
          action,
          metadata: { contains: `"${key}":` },
        })),
        createdAt: { lt: cutoff },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true, action: true, metadata: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    const updates = rows.flatMap((row) => {
      const metadata = stripExpiredMessageText(row.action, row.metadata);
      return metadata ? [{ id: row.id, metadata }] : [];
    });
    if (updates.length === 0) continue;

    await withAudit(
      async (tx) => {
        for (const { id, metadata } of updates) {
          await tx.auditLog.update({ where: { id }, data: { metadata } });
        }
      },
      {
        action: "AUDIT_MESSAGE_TEXT_REDACTED",
        userId: actorId,
        metadata: {
          actor: "SCHEDULER",
          count: updates.length,
          before: cutoff.toISOString(),
        },
      },
    );
    redacted += updates.length;
  }
  return redacted;
}

/** Supprime les lignes d'audit plus anciennes que AUDIT_RETENTION_YEARS. Retourne le nombre de lignes supprimées. */
export async function purgeExpiredAuditLog(now: Date = new Date()): Promise<number> {
  const years = auditRetentionYears();
  const cutoff = retentionCutoff(years, now);
  const actorId = await schedulerActorId();
  if (!actorId) return 0;

  let purged = 0;
  for (;;) {
    const rows = await db.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: { id: true },
    });
    if (rows.length === 0) break;

    const { count } = await withAudit(
      (tx) => tx.auditLog.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } }),
      ({ count }) => ({
        action: "AUDIT_LOG_PURGED",
        userId: actorId,
        metadata: {
          actor: "SCHEDULER",
          count,
          before: cutoff.toISOString(),
          retentionYears: years,
        },
      }),
    );
    purged += count;
  }
  return purged;
}
