import type { Changement, Evenement, Organisateur, Salle } from "./evenement.js";

/** Une ligne du journal d'audit, en ajout seul (ADR 016, scénario S-4). */
export interface LigneAudit {
  le: Date;
  utilisateurId: string;
  action: string;
  objet: string;
  objetId: string;
  avant: unknown;
  apres: unknown;
}

/**
 * Port de stockage des événements d'un organisateur (implémenté avec PostgreSQL et la Row-Level
 * Security, ADR 016). Chaque opération ne voit que les données de l'organisation de
 * l'organisateur ; chaque modification est écrite au journal d'audit dans la même transaction.
 */
export interface DepotEvenements {
  salles(): Promise<Salle[]>;
  salle(id: string): Promise<Salle | null>;
  lister(organisateur: Organisateur): Promise<Evenement[]>;
  trouver(organisateur: Organisateur, evenementId: string): Promise<Evenement | null>;
  creer(organisateur: Organisateur, evenement: Evenement): Promise<void>;
  /**
   * Applique un changement de façon atomique : lecture verrouillée, règle métier, écriture,
   * journal d'audit et événement publié, dans une seule transaction. Lève EvenementIntrouvable.
   */
  appliquer(
    organisateur: Organisateur,
    evenementId: string,
    action: string,
    changement: (evenement: Evenement) => Changement,
  ): Promise<Evenement>;
  journal(organisateur: Organisateur, limite: number): Promise<LigneAudit[]>;
}

export interface ResumeVentes {
  places: number;
  vendues: number;
  bloquees: number;
  recetteCentimes: number;
}

/** Les ventes de ses événements, lues auprès de la Réservation. */
export interface LectureVentes {
  parEvenement(evenementIds: string[]): Promise<Map<string, ResumeVentes>>;
}

export type Horloge = () => Date;

export const DEPOT_EVENEMENTS = Symbol("DepotEvenements");
export const LECTURE_VENTES = Symbol("LectureVentes");
