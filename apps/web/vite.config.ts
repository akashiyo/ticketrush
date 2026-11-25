import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En développement (pnpm dev), les appels /api passent par Traefik, comme en production.
    proxy: { "/api": "http://localhost:8000" },
  },
  build: {
    // Noms de fichiers avec empreinte : mis en cache un an par Nginx (ADR 015).
    assetsDir: "assets",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/preparation.ts"],
  },
});
