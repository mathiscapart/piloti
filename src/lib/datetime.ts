// Base unique du formatage et des calculs de date (#115). Aucun autre fichier
// ne formate une date ni ne lit ses composantes dans un fuseau : c'est
// verrouillé par datetime-usage.test.ts. Deux catégories, jamais le fuseau du
// serveur :
//
//  - HEURE MURALE — événements, tâches, échéances, dates saisies dans un
//    formulaire. Stockées en « heure murale » : les composantes UTC de la Date
//    sont l'heure saisie (cf. parseWallTime, planning/actions.ts ; une date
//    seule est stockée à minuit UTC). On formate donc TOUJOURS en UTC.
//  - INSTANT RÉEL — createdAt, messages, retours, signalements, avis… Un vrai
//    point dans le temps, affiché à l'heure du groupe : Europe/Paris.
//
// Pour comparer une heure murale à « maintenant », utiliser wallNow() et non
// new Date() : sinon l'écart vaut le décalage de Paris (1 h ou 2 h).

export const APP_TIME_ZONE = "Europe/Paris";

const STYLES = {
  time: { hour: "2-digit", minute: "2-digit" },
  dayMonth: { day: "2-digit", month: "short" },
  dayMonthLong: { day: "2-digit", month: "long" },
  dayMonthNumeric: { day: "2-digit", month: "2-digit" },
  date: { day: "2-digit", month: "short", year: "numeric" },
  dateLong: { day: "2-digit", month: "long", year: "numeric" },
  dateNumeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  dayMonthTime: { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
  dayMonthLongTime: { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" },
  dayMonthNumericTime: { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
  dateTime: {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  weekdayDayMonth: { weekday: "short", day: "2-digit", month: "short" },
  monthYear: { month: "long", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof STYLES;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, style: DateStyle): Intl.DateTimeFormat {
  const key = `${timeZone}|${style}`;
  let fmt = cache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("fr-FR", { ...STYLES[style], timeZone });
    cache.set(key, fmt);
  }
  return fmt;
}

/** Heure murale (événement, tâche, date saisie) : formatée en UTC. */
export function formatWall(d: Date, style: DateStyle): string {
  return formatter("UTC", style).format(d);
}

/** Instant réel (createdAt, message, retour…) : formaté à l'heure de Paris. */
export function formatInstant(d: Date, style: DateStyle): string {
  return formatter(APP_TIME_ZONE, style).format(d);
}

const pad = (n: number) => String(n).padStart(2, "0");

function sameWallDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// "ven. 12 sept. · 14:00 – 17:00" (même jour) ou
// "ven. 12 sept. 14:00 → dim. 14 sept. 11:00" (multi-jours).
export function formatEventRange(start: Date, end: Date): string {
  const day = (d: Date) => formatWall(d, "weekdayDayMonth");
  const time = (d: Date) => formatWall(d, "time");
  if (sameWallDay(start, end)) return `${day(start)} · ${time(start)} – ${time(end)}`;
  return `${day(start)} ${time(start)} → ${day(end)} ${time(end)}`;
}

/** Clé de regroupement par mois d'une heure murale. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

/** "Octobre 2026" pour une heure murale. */
export function monthLabel(d: Date): string {
  const s = formatWall(d, "monthYear");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Heure murale → "YYYY-MM-DDTHH:mm", pour préremplir un datetime-local. */
export function toDatetimeLocal(d: Date): string {
  return `${toDateInput(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Date murale → "YYYY-MM-DD", pour préremplir un champ date. */
export function toDateInput(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const PARIS_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

/** Instant réel → heure murale de Paris (composantes UTC = heure à Paris). */
export function instantToWall(instant: Date): Date {
  const p: Record<string, number> = {};
  for (const { type, value } of PARIS_PARTS.formatToParts(instant)) p[type] = Number(value);
  return new Date(
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, instant.getUTCMilliseconds()),
  );
}

/**
 * Heure murale de Paris → instant réel. Sert à borner une requête sur un
 * instant (ex. « remboursé en 2026 » commence le 1er janvier 00:00 à Paris).
 */
export function wallToInstant(wall: Date): Date {
  // Décalage estimé sur la valeur murale, puis corrigé une fois sur l'instant
  // obtenu : exact hors de l'heure inexistante du passage à l'heure d'été.
  const guess = new Date(2 * wall.getTime() - instantToWall(wall).getTime());
  return new Date(wall.getTime() - (instantToWall(guess).getTime() - guess.getTime()));
}

/**
 * « Maintenant » en heure murale : la Date dont les composantes UTC sont
 * l'heure qu'il est à Paris. À comparer aux heures murales (événements,
 * tâches, échéances), jamais à new Date().
 */
export function wallNow(now: Date = new Date()): Date {
  return instantToWall(now);
}

/** Date du jour à Paris, "YYYY-MM-DD" — valeur par défaut d'un champ date. */
export function todayInput(now: Date = new Date()): string {
  return toDateInput(wallNow(now));
}
