"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";

export interface MapPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  avgRating: number | null;
}

export function PlacesMap({ pins }: { pins: MapPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    // Import dynamique : Leaflet ne s'exécute que côté client (lazy load).
    let cleanup: (() => void) | undefined;

    import("leaflet").then((mod) => {
      if (cancelled || !el) return;
      // Interop CJS↔ESM : selon le bundler, l'objet Leaflet est soit le
      // namespace, soit sous `.default`. `?? mod` couvre les deux cas.
      const L = mod.default ?? mod;
      // Évite « Map container is already initialized » (effets rejoués en dev).
      if ((el as unknown as { _leaflet_id?: number })._leaflet_id) return;

      const map = L.map(el, { scrollWheelZoom: false }).setView([46.6, 2.4], 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);

      const latlngs: [number, number][] = [];
      for (const p of pins) {
        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius: 8,
          color: "#2f6b3f",
          fillColor: "#2f6b3f",
          fillOpacity: 0.85,
          weight: 2,
        }).addTo(map);
        const rating =
          p.avgRating != null ? ` ★ ${p.avgRating.toFixed(1)}` : "";
        marker.bindPopup(
          `<a href="/lieux/${p.id}" style="font-weight:700;color:#2f6b3f;text-decoration:none">${escapeHtml(
            p.name,
          )}</a><div style="color:#6b6256;font-size:12px">Voir la fiche${rating}</div>`,
        );
        latlngs.push([p.latitude, p.longitude]);
      }

      if (latlngs.length === 1) {
        map.setView(latlngs[0], 11);
      } else if (latlngs.length > 1) {
        map.fitBounds(latlngs, { padding: [40, 40] });
      }

      // Leaflet a besoin d'un recalcul de taille après le montage.
      setTimeout(() => map.invalidateSize(), 100);
      cleanup = () => map.remove();
    }).catch((err) => {
      console.error("[PlacesMap] Leaflet init failed", err);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [pins]);

  return (
    <div
      ref={containerRef}
      className="h-[70vh] w-full overflow-hidden rounded-2xl border border-stone/40 shadow-card"
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
