// Formatage des dates d'événement. Les dates sont stockées en « heure murale »
// (cf. actions.ts) : on formate donc TOUJOURS en UTC pour réafficher exactement
// l'heure saisie, sans décalage de fuseau.

const pad = (n: number) => String(n).padStart(2, "0");

// Date → "YYYY-MM-DDTHH:mm" (composantes UTC) pour préremplir un datetime-local.
export function toDatetimeLocal(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const MONTH_FMT = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// "ven. 12 sept. · 14:00 – 17:00" (même jour) ou
// "ven. 12 sept. 14:00 → dim. 14 sept. 11:00" (multi-jours).
export function formatEventRange(start: Date, end: Date): string {
  if (sameUtcDay(start, end)) {
    return `${DAY_FMT.format(start)} · ${TIME_FMT.format(start)} – ${TIME_FMT.format(end)}`;
  }
  return `${DAY_FMT.format(start)} ${TIME_FMT.format(start)} → ${DAY_FMT.format(end)} ${TIME_FMT.format(end)}`;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

export function monthLabel(d: Date): string {
  const s = MONTH_FMT.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
