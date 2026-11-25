/**
 * Schéma PostgreSQL du module Catalogue : uniquement des vues, tenues à jour par la projection des
 * événements publiés par les Organisateurs (CQRS, ADR 014, 023).
 * Migrations : pnpm --filter @ticketrush/coeur migrations:catalogue
 */
import { integer, jsonb, pgSchema, uuid } from "drizzle-orm/pg-core";

import type { FicheEvenement } from "../domaine/evenement.js";

export const schemaCatalogue = pgSchema("catalogue");

/**
 * Fiches des événements publiés : la vue lue derrière le cache Redis (ADR 015). Une ligne par
 * événement, remplacée seulement par une version plus récente.
 */
export const fiche = schemaCatalogue.table("fiche", {
  evenementId: uuid("evenement_id").primaryKey(),
  version: integer("version").notNull(),
  contenu: jsonb("contenu").$type<FicheEvenement>().notNull(),
});
