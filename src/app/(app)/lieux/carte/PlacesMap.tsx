"use client";

import { useEffect, useRef, useState } from "react";

export interface MapPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  avgRating: number | null;
}

// Injecte la CSS Leaflet auto-hébergée (public/leaflet.css) une seule fois.
// Plus fiable que l'import bundlé (qui n'était pas appliqué côté client).
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
  const [status, setStatus] = useState("init");
  const [tiles, setTiles] = useState({ ok: 0, err: 0 });
  const [cssOk, setCssOk] = useState<boolean | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    ensureLeafletCss();
    setStatus("loading-leaflet");
    import("leaflet")
      .then((mod) => {
        if (cancelled || !el) return;
        const L = mod.default ?? mod;
        if (typeof L?.map !== "function") {
          setStatus("erreur: L.map indisponible (interop)");
          return;
        }
        if ((el as unknown as { _leaflet_id?: number })._leaflet_id) return;

        const map = L.map(el, { scrollWheelZoom: false }).setView([46.6, 2.4], 6);
        // Imagerie satellite Esri World Imagery (gratuit, sans clé, CORS *).
        // OSM bloque ses tuiles publiques (x-blocked).
        const layer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution:
              "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
            maxZoom: 19,
          },
        );
        layer.on("tileload", () => setTiles((t) => ({ ...t, ok: t.ok + 1 })));
        layer.on("tileerror", () => setTiles((t) => ({ ...t, err: t.err + 1 })));
        layer.addTo(map);

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

        const fix = () => {
          map.invalidateSize();
          // La CSS est-elle appliquée ? (panneau Leaflet en position absolue)
          const pane = el.querySelector(".leaflet-pane") as HTMLElement | null;
          if (pane) {
            setCssOk(getComputedStyle(pane).position === "absolute");
          }
        };
        setTimeout(fix, 100);
        setTimeout(fix, 500);
        setTimeout(fix, 1500);
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
      <div className="pointer-events-none absolute left-2 top-2 z-[500] rounded-md bg-snow/90 px-2 py-1 text-xs font-bold text-earth shadow-card">
        carte v6 (satellite) · {pins.length} lieu{pins.length > 1 ? "x" : ""} ·{" "}
        <span className={status === "ready" ? "text-forest" : "text-brick"}>
          {status}
        </span>{" "}
        · tuiles {tiles.ok}/err {tiles.err} · css{" "}
        {cssOk === null ? "?" : cssOk ? "ok" : "KO"}
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
