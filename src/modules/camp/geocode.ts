import "server-only";

// US-L04 — géocodage d'une adresse en coordonnées GPS. Deux services, dans cet
// ordre, et l'ordre est le fond du sujet.
//
// 1. La Base Adresse Nationale (api-adresse.data.gouv.fr) — référentiel officiel
//    français, gratuit et sans clé. Elle connaît les NUMÉROS de voirie.
// 2. Nominatim (OpenStreetMap) en repli, pour ce que la BAN ne couvre pas :
//    adresses hors de France, et certains lieux-dits.
//
// Pourquoi la BAN d'abord : OSM ne cartographie les numéros que très
// inégalement. Sur une rue sans numéros — cas courant en zone rurale, donc le
// cas type d'un terrain de camp — Nominatim ne dit pas « je ne sais pas » : il
// retombe silencieusement sur l'objet « voie » et renvoie un point arbitraire de
// sa géométrie. Constaté à Thiant : « 1 », « 120 », « 146 » et « 9999 rue Jean
// Jaurès » renvoyaient tous LES MÊMES coordonnées, celles d'un tronçon de la
// rue. L'utilisateur reçoit une épingle d'apparence normale, à plusieurs
// centaines de mètres, sans le moindre signal.
//
// Best-effort de bout en bout : si les deux échouent, on renvoie null et la
// fiche est créée sans coordonnées (saisissables à la main ensuite).

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// La BAN répond en quelques dizaines de millisecondes ; inutile de laisser une
// Server Action attendre plus longtemps avant de basculer sur le repli.
const BAN_TIMEOUT_MS = 5000;
const NOMINATIM_TIMEOUT_MS = 8000;

// La BAN ne couvre que la France, mais elle ne le dit pas : plutôt que de ne
// rien renvoyer, elle rend le moins mauvais résultat français qu'elle trouve.
// « Piazza San Marco, Venise, Italie » ressort ainsi en Corse (Piazza
// San'Antone, Venaco) — sans seuil, ce faux positif écraserait le repli OSM,
// qui lui aurait trouvé Venise. Le `score` sépare franchement les deux cas :
// 0,906 pour un numéro exact, 0,666 pour un lieu-dit rattaché à sa rue, contre
// 0,403 pour la confusion corse. En dessous du seuil, on laisse la main à OSM.
const BAN_MIN_SCORE = 0.5;

function toPoint(latitude: number, longitude: number): GeoPoint | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/** Base Adresse Nationale. Réponse GeoJSON, coordonnées en [longitude, latitude]. */
async function geocodeWithBan(q: string): Promise<GeoPoint | null> {
  const url =
    "https://api-adresse.data.gouv.fr/search/?limit=1&autocomplete=0&q=" +
    encodeURIComponent(q);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(BAN_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { score?: number };
      }>;
    };
    const hit = data.features?.[0];
    const coordinates = hit?.geometry?.coordinates;
    if (!coordinates) return null;
    if ((hit?.properties?.score ?? 0) < BAN_MIN_SCORE) return null;
    const [longitude, latitude] = coordinates;
    return toPoint(latitude, longitude);
  } catch {
    return null;
  }
}

/** Nominatim (OpenStreetMap). Repli : couvre l'international et certains lieux-dits. */
async function geocodeWithNominatim(q: string): Promise<GeoPoint | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
    encodeURIComponent(q);

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim exige un User-Agent identifiant l'application.
        "User-Agent": "Piloti/1.0 (gestion de groupe SGDF)",
        "Accept-Language": "fr",
      },
      // Pas de cache : une même adresse peut être corrigée par l'utilisateur.
      cache: "no-store",
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    return toPoint(Number(hit.lat), Number(hit.lon));
  } catch {
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const q = address.trim();
  if (q.length < 3) return null;

  return (await geocodeWithBan(q)) ?? (await geocodeWithNominatim(q));
}
