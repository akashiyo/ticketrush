/**
 * Schéma PostgreSQL du module Catalogue, côté écriture (ADR 002, 014).
 * Migrations : pnpm --filter @ticketrush/coeur migrations:catalogue
 */
import { integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tableOutbox } from "../../commun/evenements/outbox.js";

export const schemaCatalogue = pgSchema("catalogue");

export const statutEvenement = schemaCatalogue.enum("statut_evenement", ["brouillon", "publie"]);
export const placement = schemaCatalogue.enum("placement", ["numerote", "libre"]);

export const salle = schemaCatalogue.table("salle", {
  id: uuid("id").primaryKey(),
  nom: text("nom").notNull(),
  ville: text("ville").notNull(),
});

export const evenement = schemaCatalogue.table("evenement", {
  id: uuid("id").primaryKey(),
  /** L'organisateur propriétaire : isolation par Row-Level Security au module Organisateurs (ADR 016). */
  organisationId: uuid("organisation_id").notNull(),
  titre: text("titre").notNull(),
  artiste: text("artiste"),
  genre: text("genre"),
  salleId: uuid("salle_id")
    .notNull()
    .references(() => salle.id),
  debutLe: timestamp("debut_le", { withTimezone: true }).notNull(),
  /** Seuls les événements publiés sont visibles du public et indexés (ADR 014). */
  statut: statutEvenement("statut").notNull().default("brouillon"),
  /** + 1 à chaque modification : les consommateurs ignorent une version plus ancienne. */
  version: integer("version").notNull().default(1),
});

export const categorie = schemaCatalogue.table("categorie", {
  id: uuid("id").primaryKey(),
  evenementId: uuid("evenement_id")
    .notNull()
    .references(() => evenement.id),
  libelle: text("libelle").notNull(),
  placement: placement("placement").notNull(),
  capacite: integer("capacite").notNull(),
  prixCentimes: integer("prix_centimes").notNull(),
});

/** Événements du catalogue à publier (ADR 007), dans le schéma du module. */
export const outbox = tableOutbox(schemaCatalogue);
