"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";

export interface MapPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  avgRating: number | null;
}

export function PlacesMap({ pins }: { pins: MapPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Diagnostic visible (sans console) : "loading" → "ready" ou message d'erreur.
  const [status, setStatus] = useState("init");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    setStatus("loading-leaflet");
    import("leaflet")
      .then((mod) => {
        if (cancelled || !el) return;
        // Interop CJS↔ESM : l'objet Leaflet est soit le namespace, soit `.default`.
        const L = mod.default ?? mod;
        if (typeof L?.map !== "function") {
          setStatus("erreur: L.map indisponible (interop)");
          return;
        }
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
        setTimeout(fix, 400);
        setTimeout(fix, 1000);
        setStatus("ready");
        cleanup = () => map.remove();
      })
      .catch((err: unknown) => {
        setStatus(`erreur: ${err instanceof Error ? err.message : String(err)}`);
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [pins]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[70vh] w-full overflow-hidden rounded-2xl border border-stone/40 bg-sand shadow-card"
      />
      {/* Bandeau diagnostic (temporaire) : confirme la version + l'état. */}
      <div className="pointer-events-none absolute left-2 top-2 z-[500] rounded-md bg-snow/90 px-2 py-1 text-xs font-bold text-earth shadow-card">
        carte v3 · {pins.length} lieu{pins.length > 1 ? "x" : ""} ·{" "}
        <span className={status === "ready" ? "text-forest" : "text-brick"}>
          {status}
        </span>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
