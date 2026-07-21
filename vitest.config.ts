import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Configuration minimale : on teste de la logique pure (src/lib, src/modules),
// pas de composants React à ce stade → pas besoin d'environnement DOM.
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
