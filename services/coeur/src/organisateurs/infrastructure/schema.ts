/**
 * Schéma PostgreSQL du module Organisateurs : le côté écriture du catalogue (ADR 016, 023).
 *
 * `evenement`, `tarif` et `audit` sont protégés par la Row-Level Security : une politique ne laisse
 * voir et écrire que les lignes de l'organisation fixée en début de transaction. Les politiques,
 * le rôle applicatif et les droits sont dans la migration 0001 (SQL écrit à la main).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { tableOutbox } from "../../commun/evenements/outbox.js";

export const schemaOrganisateurs = pgSchema("organisateurs");

export const statutEvenement = schemaOrganisateurs.enum("statut_evenement", [
  "brouillon",
  "publie",
]);
export const placement = schemaOrganisateurs.enum("placement", ["numerote", "libre"]);

/** Référentiel des salles, partagé par toutes les organisations (pas de RLS). */
export const salle = schemaOrganisateurs.table("salle", {
  id: uuid("id").primaryKey(),
  nom: text("nom").notNull(),
  ville: text("ville").notNull(),
});

export const evenement = schemaOrganisateurs.table(
  "evenement",
  {
    id: uuid("id").primaryKey(),
    organisationId: uuid("organisation_id").notNull(),
    titre: text("titre").notNull(),
    artiste: text("artiste"),
    genre: text("genre"),
    salleId: uuid("salle_id")
      .notNull()
      .references(() => salle.id),
    debutLe: timestamp("debut_le", { withTimezone: true }).notNull(),
    statut: statutEvenement("statut").notNull().default("brouillon"),
    version: integer("version").notNull().default(1),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  // La politique de RLS filtre sur organisation_id à chaque requête : il est indexé.
  (t) => [index("evenement_organisation_idx").on(t.organisationId)],
);

/** Une catégorie de places et son prix (table nommée « tarif » comme dans l'ADR 016). */
export const tarif = schemaOrganisateurs.table(
  "tarif",
  {
    id: uuid("id").primaryKey(),
    evenementId: uuid("evenement_id")
      .notNull()
      .references(() => evenement.id),
    /** Recopiée pour que la politique de RLS filtre sans jointure. */
    organisationId: uuid("organisation_id").notNull(),
    libelle: text("libelle").notNull(),
    placement: placement("placement").notNull(),
    capacite: integer("capacite").notNull(),
    prixCentimes: integer("prix_centimes").notNull(),
  },
  (t) => [index("tarif_evenement_idx").on(t.evenementId)],
);

/** Journal d'audit en ajout seul : qui, quoi, quand, sur quel objet, avant et après (S-4). */
export const audit = schemaOrganisateurs.table(
  "audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organisationId: uuid("organisation_id").notNull(),
    utilisateurId: text("utilisateur_id").notNull(),
    action: text("action").notNull(),
    objet: text("objet").notNull(),
    objetId: uuid("objet_id").notNull(),
    avant: jsonb("avant"),
    apres: jsonb("apres"),
    le: timestamp("le", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("audit_organisation_idx").on(t.organisationId, t.id)],
);

/** Événements du catalogue à publier (ADR 007) : EvenementPublie, EvenementModifie, TarifModifie. */
export const outbox = tableOutbox(schemaOrganisateurs);
