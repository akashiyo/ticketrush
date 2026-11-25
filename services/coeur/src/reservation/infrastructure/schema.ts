/**
 * Schéma PostgreSQL du module Réservation (ADR 002, 003, 007).
 *
 * Le module est le seul à lire et écrire le schéma `reservation`. Les migrations sont générées
 * depuis ce fichier : pnpm --filter @ticketrush/coeur migrations:reservation
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { tableOutbox } from "../../commun/evenements/outbox.js";

export const schemaReservation = pgSchema("reservation");

export const statutSiege = schemaReservation.enum("statut_siege", ["libre", "bloque", "vendu"]);

export const statutReservation = schemaReservation.enum("statut_reservation", [
  "en_attente_paiement",
  "payee",
  "expiree",
  "a_rembourser",
]);

/**
 * Tarif de chaque catégorie, recopié depuis le Catalogue (aujourd'hui : données de démonstration ;
 * plus tard : événements EvenementPublie et TarifModifie). La Réservation n'interroge jamais le
 * schéma d'un autre module (ADR 002).
 */
export const placement = schemaReservation.enum("placement", ["numerote", "libre"]);

export const categorie = schemaReservation.table("categorie", {
  id: uuid("id").primaryKey(),
  evenementId: uuid("evenement_id").notNull(),
  libelle: text("libelle").notNull(),
  /** numerote : l'acheteur choisit son siège ; libre : fosse, place attribuée (ADR 003). */
  placement: placement("placement").notNull(),
  prixCentimes: integer("prix_centimes").notNull(),
});

/** Une place à vendre. Une ligne par place, numérotée ou en placement libre (fosse). */
export const siege = schemaReservation.table(
  "siege",
  {
    id: uuid("id").primaryKey(),
    evenementId: uuid("evenement_id").notNull(),
    /** Recopié ici pour remplir l'enveloppe des événements sans lire un autre schéma (ADR 002). */
    organisationId: uuid("organisation_id").notNull(),
    categorieId: uuid("categorie_id")
      .notNull()
      .references(() => categorie.id),
    /** Numéro affiché (« A-12 ») ; null en placement libre. */
    numero: text("numero"),
    statut: statutSiege("statut").notNull().default("libre"),
    /**
     * Réservation qui bloque ou a acheté la place. Pas de clé étrangère : le blocage commence
     * par l'UPDATE atomique, pour qu'un acheteur qui perd la place ne coûte qu'un seul ordre SQL.
     */
    reservationId: uuid("reservation_id"),
    bloqueJusqua: timestamp("bloque_jusqua", { withTimezone: true }),
  },
  (t) => [
    // Recherche d'une place libre en placement libre (ADR 003).
    index("siege_disponibilite_idx").on(t.evenementId, t.categorieId, t.statut),
    // Recherche des blocages expirés par le worker d'expiration.
    index("siege_blocages_idx")
      .on(t.bloqueJusqua)
      .where(sql`statut = 'bloque'`),
    // Une place bloquée a une réservation et une échéance ; une place vendue, une réservation.
    check(
      "siege_statut_coherent",
      sql`statut = 'libre'
        OR (statut = 'bloque' AND reservation_id IS NOT NULL AND bloque_jusqua IS NOT NULL)
        OR (statut = 'vendu' AND reservation_id IS NOT NULL)`,
    ),
  ],
);

/** Une réservation : un acheteur, la place qu'il a bloquée, son prix, son paiement. */
export const reservation = schemaReservation.table("reservation", {
  id: uuid("id").primaryKey(),
  evenementId: uuid("evenement_id").notNull(),
  acheteurId: text("acheteur_id").notNull(),
  siegeId: uuid("siege_id").notNull(),
  /** Prix figé au moment du blocage : l'acheteur paie le prix affiché. */
  prixCentimes: integer("prix_centimes").notNull(),
  bloqueJusqua: timestamp("bloque_jusqua", { withTimezone: true }).notNull(),
  statut: statutReservation("statut").notNull().default("en_attente_paiement"),
  paiementId: text("paiement_id"),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

/** Un billet émis après paiement accepté. */
export const billet = schemaReservation.table(
  "billet",
  {
    id: uuid("id").primaryKey(),
    evenementId: uuid("evenement_id").notNull(),
    siegeId: uuid("siege_id")
      .notNull()
      .references(() => siege.id),
    reservationId: uuid("reservation_id")
      .notNull()
      .unique()
      .references(() => reservation.id),
    acheteurId: text("acheteur_id").notNull(),
    prixCentimes: integer("prix_centimes").notNull(),
    emisLe: timestamp("emis_le", { withTimezone: true }).notNull().defaultNow(),
  },
  // Filet de sécurité de l'ADR 003 : même avec un bug applicatif, une place n'a qu'un billet.
  (t) => [unique("billet_place_unique").on(t.evenementId, t.siegeId)],
);

/** Événements à publier sur Redpanda, écrits dans la même transaction que l'effet métier (ADR 007). */
export const outbox = tableOutbox(schemaReservation);
