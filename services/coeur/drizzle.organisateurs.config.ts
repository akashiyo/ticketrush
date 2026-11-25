// Génération des migrations du module Organisateurs : pnpm --filter @ticketrush/coeur migrations:organisateurs
// Une configuration par module : chaque module a son schéma PostgreSQL et ses migrations (ADR 002).
// La Row-Level Security, le rôle applicatif et les droits sont dans une migration SQL écrite à la
// main (drizzle-kit generate --custom), relue comme du code.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/organisateurs/infrastructure/schema.ts",
  out: "./src/organisateurs/infrastructure/migrations",
  schemaFilter: ["organisateurs"],
});
