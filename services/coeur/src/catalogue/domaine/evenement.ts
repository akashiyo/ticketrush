/**
 * Domaine du Catalogue : le **côté lecture** du CQRS (ADR 014, 023).
 *
 * Le Catalogue n'écrit rien de lui-même : il reçoit les événements publiés par les Organisateurs
 * et en tient deux vues à jour, l'index de recherche (Meilisearch) et les fiches (PostgreSQL,
 * derrière le cache Redis de l'ADR 015).
 */

export interface CategorieVue {
  categorieId: string;
  libelle: string;
  placement: "numerote" | "libre";
  capacite: number;
  prixCentimes: number;
}

/** Ce que le public voit d'un événement publié : uniquement des données publiques. */
export interface VueEvenement {
  evenementId: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: { nom: string; ville: string };
  debutLe: string;
  categories: CategorieVue[];
  /** Version de l'événement : une mise à jour plus ancienne que celle enregistrée est ignorée. */
  version: number;
}

/** La fiche affichée : la vue, sans sa version technique. */
export type FicheEvenement = Omit<VueEvenement, "version">;

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

export interface EvenementTrouve {
  id: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: string;
  ville: string;
  debutLe: string;
  prixMinCentimes: number;
}

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
