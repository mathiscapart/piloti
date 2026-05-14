import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AuditAction } from "@/lib/enums";

type Tx = Prisma.TransactionClient;

export interface AuditContext {
  /** Type d'action. Choisir dans AUDIT_ACTIONS quand c'est possible. */
  action: AuditAction | string;
  /** ID de l'utilisateur qui déclenche la mutation. */
  userId: string;
  equipmentId?: string | null;
  loanId?: string | null;
  incidentId?: string | null;
  /** Métadonnées libres (oldValue/newValue/raison/etc.). JSON-stringifiées. */
  metadata?: Record<string, unknown>;
}

/**
 * Exécute `fn` dans une transaction Prisma et insère un AuditLog atomiquement.
 *
 * Règle invariante du projet : toute mutation de données passe par ce helper
 * pour garantir qu'une trace est créée dans la même transaction que la mutation.
 * Si la mutation échoue, l'AuditLog n'est pas créé non plus (et inversement).
 */
export async function withAudit<T>(
  ctx: AuditContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    const result = await fn(tx);
    await tx.auditLog.create({
      data: {
        action: ctx.action,
        userId: ctx.userId,
        equipmentId: ctx.equipmentId ?? null,
        loanId: ctx.loanId ?? null,
        incidentId: ctx.incidentId ?? null,
        metadata: JSON.stringify(ctx.metadata ?? {}),
      },
    });
    return result;
  });
}
