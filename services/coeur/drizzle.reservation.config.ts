// Génération des migrations du module Réservation : pnpm --filter @ticketrush/coeur migrations:reservation
// Une configuration par module : chaque module a son schéma PostgreSQL et ses migrations (ADR 002).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/reservation/infrastructure/schema.ts",
  out: "./src/reservation/infrastructure/migrations",
  schemaFilter: ["reservation"],
});
