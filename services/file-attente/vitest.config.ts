import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les tests démarrent un vrai Redis dans Docker (Testcontainers) : premier lancement plus long.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
