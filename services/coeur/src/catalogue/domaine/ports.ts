import type {
  CriteresRecherche,
  FicheEvenement,
  ResultatRecherche,
  VueEvenement,
} from "./evenement.js";

/** Un magasin de vues tenu à jour par la projection (index de recherche, table des fiches). */
export interface MagasinVues {
  lire(evenementId: string): Promise<VueEvenement | null>;
  /** Ajoute ou remplace la vue ; visible au retour de l'appel. */
  ecrire(vue: VueEvenement): Promise<void>;
}

/** Index de recherche du catalogue (implémenté avec Meilisearch, ADR 014). */
export interface IndexRecherche extends MagasinVues {
  rechercher(criteres: CriteresRecherche): Promise<ResultatRecherche>;
}

/** Fiche d'un événement publié ; null s'il est inconnu. */
export interface LectureFiche {
  lire(evenementId: string): Promise<FicheEvenement | null>;
}

export const INDEX_RECHERCHE = Symbol("IndexRecherche");
export const LECTURE_FICHE = Symbol("LectureFiche");
