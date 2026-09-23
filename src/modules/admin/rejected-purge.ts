import "server-only";

import { db } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { anonymizeUserInTx } from "@/lib/anonymize";

import { rejectedRetentionCutoff } from "./rejected-retention";

// Erreur contrôlée : la cible est sortie de REJECTED entre le findMany et la
// transaction (ex. reactivateUser entre-temps) — on l'ignore sans écrire de
// faux USER_DELETED (withAudit insère l'AuditLog même si fn ne fait rien,
// donc le seul moyen de ne rien écrire est de faire échouer la transaction).
class TargetNoLongerRejectedError extends Error {}

// RGPD — un compte REJECTED n'a plus vocation à être conservé identifiable
// au-delà de 30 jours (recours ou nouvelle demande) : anonymisation
// automatique, exécutée périodiquement par le scheduler (cf. src/lib/scheduler.ts).
export async function purgeExpiredRejectedUsers(): Promise<number> {
  const expired = await db.user.findMany({
    where: { status: "REJECTED", rejectedAt: { lt: rejectedRetentionCutoff() } },
    select: { id: true },
  });
  if (expired.length === 0) return 0;

  let purgedCount = 0;
  for (const { id } of expired) {
    try {
      await withAudit(
        async (tx) => {
          const current = await tx.user.findUnique({
            where: { id },
            select: { status: true },
          });
          if (current?.status !== "REJECTED") throw new TargetNoLongerRejectedError();
          return anonymizeUserInTx(tx, id);
        },
        {
          action: "USER_DELETED",
          // Pas d'utilisateur système : l'auteur de l'anonymisation est le compte
          // lui-même, personne d'autre n'a agi ici.
          userId: id,
          metadata: { targetUserId: id, mode: "anonymized", trigger: "retention" },
        },
      );

      // Supprime sessions et credentials en dehors de la transaction principale
      // (non-critique si l'une échoue après que le compte soit marqué DELETED),
      // même geste que la suppression manuelle (cf. deleteUser).
      await db.session.deleteMany({ where: { userId: id } });
      await db.account.deleteMany({ where: { userId: id } });
      purgedCount++;
    } catch (err) {
      // Une cible qui a échappé au statut REJECTED n'est pas une erreur à
      // remonter : les vraies erreurs (Prisma, contrainte, etc.) le sont.
      if (!(err instanceof TargetNoLongerRejectedError)) {
        console.error("[scheduler] échec de purge du compte refusé", id, err);
      }
    }
  }

  return purgedCount;
}
