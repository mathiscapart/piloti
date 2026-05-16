import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [],
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
