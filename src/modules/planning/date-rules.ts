// #75 — règles de dates du planning, pures. Toutes les dates sont des heures
// murales (cf. src/lib/datetime.ts) ; `now` vient de wallNow().

const YEARS_BEFORE = 1;
const YEARS_AFTER = 5;

function yearRange(now: Date): { min: number; max: number } {
  const year = now.getUTCFullYear();
  return { min: year - YEARS_BEFORE, max: year + YEARS_AFTER };
}

function outOfRange(dates: Date[], now: Date): { min: number; max: number } | null {
  const range = yearRange(now);
  const bad = dates.some((d) => {
    const y = d.getUTCFullYear();
    return y < range.min || y > range.max;
  });
  return bad ? range : null;
}

/**
 * Message d'erreur, ou null si les dates sont acceptables. Le début passé
 * n'est refusé qu'à la création : en modification, on doit pouvoir corriger
 * un événement déjà passé.
 */
export function checkEventDates(
  dates: { start: Date; end: Date; deadline: Date | null },
  opts: { now: Date; creating: boolean },
): string | null {
  const { start, end, deadline } = dates;
  const range = outOfRange(deadline ? [start, end, deadline] : [start, end], opts.now);
  if (range) return `Les dates doivent être comprises entre ${range.min} et ${range.max}.`;
  if (end < start) return "La date de fin doit être postérieure au début.";
  if (deadline && deadline > start) {
    return "La date limite d'inscription doit précéder le début de l'événement.";
  }
  if (opts.creating && start < opts.now) return "Le début de l'événement est déjà passé.";
  return null;
}

/** Échéance de tâche : vide acceptée, passée acceptée, année bornée. */
export function checkTaskDueDate(due: Date | null, now: Date): string | null {
  if (!due) return null;
  const range = outOfRange([due], now);
  return range ? `L'échéance doit être comprise entre ${range.min} et ${range.max}.` : null;
}
