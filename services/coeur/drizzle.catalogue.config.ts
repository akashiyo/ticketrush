// Génération des migrations du module Catalogue : pnpm --filter @ticketrush/coeur migrations:catalogue
// Une configuration par module : chaque module a son schéma PostgreSQL et ses migrations (ADR 002).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/catalogue/infrastructure/schema.ts",
  out: "./src/catalogue/infrastructure/migrations",
  schemaFilter: ["catalogue"],
});
