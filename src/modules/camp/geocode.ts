import "server-only";

// US-L04 — géocodage d'une adresse en coordonnées GPS via Nominatim
// (OpenStreetMap), cohérent avec le choix open-source (Leaflet/OSM côté carte).
// Best-effort : en cas d'échec réseau ou d'adresse introuvable, on renvoie null
// et la fiche est créée sans coordonnées (saisissables/réessayables ensuite).

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const q = address.trim();
  if (q.length < 3) return null;

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
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}
