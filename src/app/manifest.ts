import type { MetadataRoute } from "next";

// Web App Manifest : Next.js 16 le sert automatiquement à /manifest.webmanifest
// dès qu'on exporte ce fichier. Couplé à `appleWebApp.capable` dans le layout,
// l'app s'ouvre en mode standalone sur iOS (pas de barre Safari) et toute
// navigation interne reste dans l'app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Piloti — Gestion matériel scout",
    short_name: "Piloti",
    description:
      "Application de gestion du matériel pour les Scouts et Guides de France.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4ede0",
    theme_color: "#2f5d3a",
    lang: "fr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
