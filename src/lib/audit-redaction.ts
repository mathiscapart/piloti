// RGPD-04 / issue #94 — l'anonymisation d'un compte (`anonymize.ts`) laissait
// de la PII en clair dans `AuditLog.metadata` (ex. USER_REJECTED.reason,
// USER_BIRTHDATE_CHANGED.from/to). Fonction PURE, en liste blanche : on ne
// conserve que ce qui n'identifie pas la personne, tout le reste est retiré.
//
// Inventaire des clés de `metadata` à travers `src/modules/**` (withAudit) :
//   - clés finissant par `Id`/`Ids` : toujours des références (targetUserId,
//     guardianUserId, consentId, familyLinkId, eventId, placeId…) — jamais du
//     texte libre. On les garde même quand elles pointent vers UNE AUTRE
//     personne (ex. guardianUserId sur un compte enfant) : c'est un id, il se
//     résout en « Compte supprimé » une fois la cible elle-même anonymisée.
//   - une petite liste de clés structurelles, non personnelles par nature :
//     `mode` (ex. "anonymized"), `unit`/`assignedRoles`/`roles` (codes de
//     branche/rôle, pas des noms), `fields` (noms de champs modifiés, pas leur
//     valeur), `profileUpdated`/`canLoginEnabled` (booléens), `value` (statut
//     de consentement), `response` (réponse RSVP), et les codes métier issus
//     d'enums (`method`, `category`, `kind`, `type`, `targetType`, `severity`,
//     `condition`, `trigger`).
//   - nombres et booléens (`amountCents`, `quantity`, `present`, `social`,
//     `exempt`…) : toujours conservés. Ils portent l'historique comptable et
//     de présence, qui doit survivre à l'effacement, et n'identifient personne.
//   - tout le reste (`reason`, `from`, `to`, `name`…) est du texte libre ou une
//     valeur personnelle (motif de refus, date de naissance…) et est retiré.
const STRUCTURAL_KEYS = new Set([
  "mode",
  "unit",
  "assignedRoles",
  "roles",
  "fields",
  "profileUpdated",
  "canLoginEnabled",
  "value",
  "response",
  "method",
  "category",
  "kind",
  "type",
  "targetType",
  "severity",
  "condition",
  "trigger",
]);

function isKept(key: string, value: unknown): boolean {
  return (
    typeof value === "number" ||
    typeof value === "boolean" ||
    /Ids?$/.test(key) ||
    STRUCTURAL_KEYS.has(key)
  );
}

/**
 * Reçoit le JSON brut d'un `AuditLog.metadata` et l'userId anonymisé. Retire
 * les clés non listées dès qu'au moins une valeur de premier niveau référence
 * cet userId, et marque l'entrée `redacted: true` dans ce cas. Retourne le
 * JSON inchangé (`null`) si rien ne doit bouger — pour ne pas réécrire une
 * ligne d'audit sans raison. Ne plante jamais sur un JSON invalide.
 */
export function redactAuditMetadata(rawMetadata: string, userId: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMetadata);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const referencesUser = entries.some(([, value]) => value === userId);
  if (!referencesUser) return null;

  const kept: Record<string, unknown> = {};
  let changed = false;
  for (const [key, value] of entries) {
    if (isKept(key, value)) {
      kept[key] = value;
    } else {
      changed = true;
    }
  }
  if (!changed) return null;

  kept.redacted = true;
  return JSON.stringify(kept);
}
