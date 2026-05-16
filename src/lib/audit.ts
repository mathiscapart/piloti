import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AuditAction } from "@/lib/enums";

type Tx = Prisma.TransactionClient; // shorthand used only within this file

export interface AuditContext {
  /** Action type. Must be one of the canonical values in AUDIT_ACTIONS (src/lib/enums.ts). */
  action: AuditAction;
  /** ID of the user who triggered the mutation. */
  userId: string;
  equipmentId?: string | null;
  loanId?: string | null;
  incidentId?: string | null;
  /** Free-form metadata (old/new values, reason, etc.). Stored as JSON. */
  metadata?: Record<string, unknown>;
}

/**
 * Runs `fn` inside a Prisma transaction and atomically inserts an AuditLog.
 *
 * Project invariant: every data mutation goes through this helper so that a
 * trace is always created in the same transaction as the mutation itself.
 *
 * `ctx` can be:
 *   - A static object — for updates/deletes where the target ID is known upfront.
 *   - A callback `(result) => AuditContext` — for creates where the ID only
 *     exists after `fn` resolves (avoids the chicken/egg problem).
 *
 * Arguments are ordered so TypeScript infers T from `fn` before typing `ctx`.
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
