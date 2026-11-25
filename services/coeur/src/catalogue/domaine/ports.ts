import type {
  CriteresRecherche,
  DocumentRecherche,
  FicheEvenement,
  ResultatRecherche,
} from "./evenement.js";

/** Index de recherche du catalogue (implémenté avec Meilisearch, ADR 014). */
export interface IndexRecherche {
  lire(evenementId: string): Promise<DocumentRecherche | null>;
  /** Ajoute ou remplace le document ; visible dans les recherches au retour de l'appel. */
  indexer(document: DocumentRecherche): Promise<void>;
  rechercher(criteres: CriteresRecherche): Promise<ResultatRecherche>;
}

/** Fiche d'un événement publié ; null s'il est inconnu ou pas encore publié. */
export interface LectureFiche {
  lire(evenementId: string): Promise<FicheEvenement | null>;
}

export const INDEX_RECHERCHE = Symbol("IndexRecherche");
export const LECTURE_FICHE = Symbol("LectureFiche");
