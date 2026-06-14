"use client";

import { useEffect, useRef } from "react";

export interface MapPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  avgRating: number | null;
}

// Injecte la CSS Leaflet auto-hébergée (public/leaflet.css) une seule fois.
function ensureLeafletCss() {
  const id = "leaflet-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "/leaflet.css";
  document.head.appendChild(link);
}

export function PlacesMap({ pins }: { pins: MapPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    ensureLeafletCss();
    import("leaflet")
      .then((mod) => {
        if (cancelled || !el) return;
        // Interop CJS↔ESM : l'objet Leaflet est soit le namespace, soit `.default`.
        const L = mod.default ?? mod;
        if (typeof L?.map !== "function") return;
        if ((el as unknown as { _leaflet_id?: number })._leaflet_id) return;

        const map = L.map(el, { scrollWheelZoom: false }).setView([46.6, 2.4], 6);
        // Imagerie satellite Esri World Imagery (gratuit, sans clé, CORS *).
        const satellite = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution:
              "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
            maxZoom: 19,
          },
        );
        // Plan de rues Carto (basé OSM, CORS *). OSM bloque ses tuiles publiques.
        const streets = L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          {
            attribution: "© OpenStreetMap, © CARTO",
            maxZoom: 19,
            subdomains: "abcd",
          },
        );
        satellite.addTo(map);
        L.control
          .layers({ Satellite: satellite, Plan: streets }, {}, { collapsed: true })
          .addTo(map);

        const latlngs: [number, number][] = [];
        for (const p of pins) {
          const marker = L.circleMarker([p.latitude, p.longitude], {
            radius: 8,
            color: "#2f6b3f",
            fillColor: "#2f6b3f",
            fillOpacity: 0.85,
            weight: 2,
          }).addTo(map);
          const rating = p.avgRating != null ? ` ★ ${p.avgRating.toFixed(1)}` : "";
          marker.bindPopup(
            `<a href="/lieux/${p.id}" style="font-weight:700;color:#2f6b3f;text-decoration:none">${escapeHtml(
              p.name,
            )}</a><div style="color:#6b6256;font-size:12px">Voir la fiche${rating}</div>`,
          );
          latlngs.push([p.latitude, p.longitude]);
        }

        if (latlngs.length === 1) map.setView(latlngs[0], 11);
        else if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [40, 40] });

        // Recalcule la taille plusieurs fois (layout mobile parfois tardif).
        const fix = () => map.invalidateSize();
        setTimeout(fix, 100);
        setTimeout(fix, 500);
        setTimeout(fix, 1500);
        cleanup = () => map.remove();
      })
      .catch(() => {
        // Échec d'init Leaflet : la carte reste vide, sans casser la page.
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [pins]);

  return (
    <div
      ref={containerRef}
      className="h-[70vh] w-full overflow-hidden rounded-2xl border border-stone/40 bg-sand shadow-card"
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
