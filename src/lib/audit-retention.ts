// #163 — durées de conservation du journal d'audit (RGPD art. 5-1-e, 13-2-a).
// Fonctions pures : `src/modules/admin/audit-purge.ts` les applique en base,
// `/confidentialite` affiche les durées, `src/instrumentation.ts` valide la
// configuration au démarrage.

/** Texte des messages de salon dans l'audit : durée fixe, non configurable. */
export const MESSAGE_TEXT_RETENTION_YEARS = 1;

/** Journal d'audit entier : aligné sur l'historique comptable (10 ans). */
export const DEFAULT_AUDIT_RETENTION_YEARS = 10;

// Borne haute : au-delà, la durée ne veut plus rien dire et une valeur absurde
// (faute de frappe) ferait sortir la date seuil des dates représentables.
const MAX_AUDIT_RETENTION_YEARS = 100;

/**
 * Lit `AUDIT_RETENTION_YEARS`. Absente ou vide → 10 ans. Sinon un entier entre
 * 1 et 100 : le minimum est la durée du texte des messages, pour que le journal
 * ne soit jamais purgé avant lui. Toute autre valeur lève une erreur, levée au
 * démarrage du serveur plutôt qu'à la première purge.
 */
export function parseAuditRetentionYears(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) return DEFAULT_AUDIT_RETENTION_YEARS;
  const years = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(years >= MESSAGE_TEXT_RETENTION_YEARS && years <= MAX_AUDIT_RETENTION_YEARS)) {
    throw new Error(
      `AUDIT_RETENTION_YEARS invalide (« ${value} ») : attendu un nombre entier ` +
        `d'années entre ${MESSAGE_TEXT_RETENTION_YEARS} et ${MAX_AUDIT_RETENTION_YEARS} ` +
        `(vide = ${DEFAULT_AUDIT_RETENTION_YEARS}).`,
    );
  }
  return years;
}

/** Durée de conservation du journal pour cette instance. */
export function auditRetentionYears(): number {
  return parseAuditRetentionYears(process.env.AUDIT_RETENTION_YEARS);
}

/**
 * Date seuil : une ligne créée STRICTEMENT avant est expirée. Une ligne qui a
 * exactement la durée est donc conservée jusqu'au passage suivant.
 */
export function retentionCutoff(years: number, now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

// Seules clés de texte libre recopiées par `editMessage` / `deleteMessage`
// (src/modules/communication/actions.ts).
const MESSAGE_TEXT_KEY: Record<string, string> = {
  MESSAGE_EDITED: "previousBody",
  MESSAGE_DELETED: "body",
};

export const MESSAGE_TEXT_ACTIONS = Object.entries(MESSAGE_TEXT_KEY).map(
  ([action, key]) => ({ action, key }),
);

/**
 * Retire le texte du message d'une metadata d'audit expirée et marque l'entrée
 * `redacted: true` (même badge que l'anonymisation dans `/admin/audit`).
 * Retourne `null` quand il n'y a rien à réécrire : autre action, clé absente
 * (déjà expurgée ou anonymisée), metadata vide ou JSON invalide.
 */
export function stripExpiredMessageText(action: string, rawMetadata: string | null): string | null {
  const key = MESSAGE_TEXT_KEY[action];
  if (!key || !rawMetadata) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMetadata);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  if (!(key in parsed)) return null;

  const kept: Record<string, unknown> = { ...parsed, redacted: true };
  delete kept[key];
  return JSON.stringify(kept);
}
