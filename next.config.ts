import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // N'annonce pas la techno dans les en-têtes de réponse.
  poweredByHeader: false,
  images: {
    remotePatterns: [],
  },
  experimental: {
    serverActions: {
      // Les uploads passent par des Server Actions et `src/lib/upload.ts`
      // accepte jusqu'à 10 Mo. Sans ce réglage, la limite par défaut de Next
      // (1 Mo) rejetait la requête AVANT d'atteindre notre validation : le
      // plafond applicatif était inatteignable et les photos un peu lourdes
      // échouaient. La marge couvre l'encodage multipart.
      bodySizeLimit: "12mb",
    },
  },
  // Next 16 bloque par défaut les accès cross-origin au dev server (HMR + assets)
  // pour éviter qu'un site distant scanne le LAN. On autorise les IPs LAN locales
  // pour pouvoir tester depuis téléphone / autre poste sur le même WiFi.
  allowedDevOrigins: ["192.168.1.*", "192.168.27.*"],
  // En mode standalone, Next tente de tracer les modules natifs ; on force
  // ceux qui peuvent être manqués (better-sqlite3 .node binding).
  outputFileTracingIncludes: {
    "*": [
      "./node_modules/better-sqlite3/build/Release/*.node",
      "./node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build/Release/*.node",
    ],
  },
};

export default nextConfig;
