import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Configuration minimale : on teste de la logique pure (src/lib, src/modules),
// pas de composants React dans un DOM → pas besoin d'environnement DOM.
// Exception : NextEventCard.test.ts rend un composant côté serveur
// (react-dom/server) pour prouver que l'heure ne dépend pas du fuseau (#115).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
