/**
 * Domaine du Catalogue, côté lecture (CQRS, ADR 014).
 *
 * Deux vues d'un même événement publié :
 * - la **fiche**, lue dans PostgreSQL derrière le cache Redis (ADR 015) ;
 * - le **document de recherche**, tenu à jour dans Meilisearch par la projection des événements.
 */

export interface CategorieFiche {
  categorieId: string;
  libelle: string;
  placement: "numerote" | "libre";
  prixCentimes: number;
  capacite: number;
}

export interface FicheEvenement {
  evenementId: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: { nom: string; ville: string };
  debutLe: string;
  categories: CategorieFiche[];
}

/** Ce que contient l'index de recherche : uniquement des données publiques (ADR 014). */
export interface DocumentRecherche {
  id: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: string;
  ville: string;
  debutLe: string;
  /** La date en secondes : Meilisearch ne filtre que des nombres. */
  debutLeTs: number;
  prixMinCentimes: number;
  categories: { categorieId: string; libelle: string; prixCentimes: number }[];
  /** Version de l'événement : une mise à jour plus ancienne que celle indexée est ignorée. */
  version: number;
}

export interface CriteresRecherche {
  texte: string;
  ville?: string;
  genre?: string;
  /** Date de début incluse. */
  du?: Date;
  /** Date de fin exclue. */
  avant?: Date;
  page: number;
  parPage: number;
}

export type EvenementTrouve = Omit<DocumentRecherche, "version" | "debutLeTs">;

export interface ResultatRecherche {
  total: number;
  page: number;
  parPage: number;
  evenements: EvenementTrouve[];
}

/** Le prix « à partir de » affiché dans les résultats. */
export function prixMinimum(categories: { prixCentimes: number }[]): number {
  return Math.min(...categories.map((c) => c.prixCentimes));
}
