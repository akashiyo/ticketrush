/**
 * Types TypeScript des événements publiés par le Cœur (fournisseur : P1).
 *
 * Miroir de asyncapi/evenements-coeur.yaml, qui reste la source de vérité. Le Cœur et ses
 * consommateurs (File d'attente, Analytique, projection) importent les mêmes types.
 */

export const TOPIC_CATALOGUE = "catalogue.evenements";
export const TOPIC_VENTES = "reservation.ventes";

type Uuid = string;
/** Date ISO 8601, par exemple "2026-12-01T10:00:00.000Z". */
type DateIso = string;
type Devise = "EUR";

/** Champs communs : contenu de la colonne `contenu` de l'Outbox (ADR 007). */
interface Enveloppe<T extends string, D> {
  /** Identifiant unique du message : clé d'idempotence des consommateurs. */
  id: Uuid;
  type: T;
  versionSchema: 1;
  survenuLe: DateIso;
  /** Le spectacle ; aussi la clé de partition Kafka. */
  evenementId: Uuid;
  /** Organisation propriétaire de l'événement (isolation dans l'Analytique, S-3). */
  organisationId: Uuid;
  donnees: D;
}

export interface Categorie {
  categorieId: Uuid;
  libelle: string;
  /** numerote : siège choisi ; libre : fosse, place attribuée (ADR 003). */
  placement: "numerote" | "libre";
  /**
   * Nombre total de places : point de départ du stock restant, calculé par la File
   * (PlaceBloquee − 1, BlocageExpire + 1, BilletEmis 0). Indicatif : la garantie reste dans PostgreSQL.
   */
  capacite: number;
  prixCentimes: number;
}

export interface EtatEvenement {
  titre: string;
  artiste?: string;
  genre?: string;
  salle: { salleId: Uuid; nom: string; ville: string };
  debutLe: DateIso;
  categories: Categorie[];
  devise: Devise;
  /** + 1 à chaque modification ; une version plus ancienne est ignorée (ADR 014). */
  versionEvenement: number;
}

// Topic catalogue.evenements
export type EvenementPublie = Enveloppe<"EvenementPublie", EtatEvenement>;
export type EvenementModifie = Enveloppe<"EvenementModifie", EtatEvenement>;
export type TarifModifie = Enveloppe<
  "TarifModifie",
  { categorieId: Uuid; prixCentimes: number; devise: Devise; versionEvenement: number }
>;

// Topic reservation.ventes
export type PlaceBloquee = Enveloppe<
  "PlaceBloquee",
  { reservationId: Uuid; siegeId: Uuid; categorieId: Uuid; bloqueJusqua: DateIso }
>;
export type BlocageExpire = Enveloppe<
  "BlocageExpire",
  { reservationId: Uuid; siegeId: Uuid; categorieId: Uuid }
>;
export type BilletEmis = Enveloppe<
  "BilletEmis",
  {
    billetId: Uuid;
    reservationId: Uuid;
    siegeId: Uuid;
    categorieId: Uuid;
    /** sub Keycloak : seule donnée personnelle des événements (envoi du billet par e-mail). */
    acheteurId: string;
    prixCentimes: number;
    devise: Devise;
  }
>;

export type EvenementCatalogue = EvenementPublie | EvenementModifie | TarifModifie;
export type EvenementVente = PlaceBloquee | BlocageExpire | BilletEmis;
