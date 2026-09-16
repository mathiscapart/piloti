// RGPD — un compte REJECTED garde ses données personnelles au plus 30 jours
// (recours possible ou nouvelle demande), puis anonymisation automatique.
export const REJECTED_RETENTION_DAYS = 30;

/** Date avant laquelle un `rejectedAt` est considéré comme expiré. */
export function rejectedRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REJECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** Date à laquelle un compte REJECTED sera anonymisé automatiquement. */
export function rejectedPurgeDate(rejectedAt: Date): Date {
  return new Date(rejectedAt.getTime() + REJECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
