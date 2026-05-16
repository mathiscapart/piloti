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
 *
 * Le contexte d'audit peut être :
 *   - Un objet statique : pour les updates / deletes où l'ID est connu d'avance.
 *   - Une fonction `(result) => AuditContext` : pour les creates où l'ID
 *     n'existe qu'après l'appel à `fn` (chicken/egg).
 *
 * Ordre des arguments choisi pour permettre à TypeScript d'inférer T depuis
 * `fn` avant de typer le callback `ctx`.
 */
export async function withAudit<T>(
  fn: (tx: Tx) => Promise<T>,
  ctx: AuditContext | ((result: T) => AuditContext),
): Promise<T> {
  return db.$transaction(async (tx) => {
    const result = await fn(tx);
    const resolved = typeof ctx === "function" ? ctx(result) : ctx;
    await tx.auditLog.create({
      data: {
        action: resolved.action,
        userId: resolved.userId,
        equipmentId: resolved.equipmentId ?? null,
        loanId: resolved.loanId ?? null,
        incidentId: resolved.incidentId ?? null,
        metadata: JSON.stringify(resolved.metadata ?? {}),
      },
    });
    return result;
  });
}
