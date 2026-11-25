import type { Admission, Blocage, DemandeBlocage } from "./blocage.js";
import type { PlanDeSalle } from "./plan.js";
import type { Billet, DemandePaiement, Reservation, ResultatPaiement } from "./reservation.js";

/**
 * Port de stockage des places, défini par le domaine (implémenté avec PostgreSQL, ADR 003).
 *
 * `bloquer` est atomique : deux appels concurrents sur la même place ne peuvent pas réussir
 * tous les deux. Renvoie null si la place n'est pas disponible.
 */
export interface DepotSieges {
  bloquer(
    demande: DemandeBlocage,
    reservation: { reservationId: string; acheteurId: string },
    dureeSec: number,
  ): Promise<Blocage | null>;
}

/** Port de stockage des réservations et des billets. */
export interface DepotReservations {
  trouver(reservationId: string): Promise<Reservation | null>;
  /**
   * Dans une seule transaction : la place passe à « vendue » si elle est toujours bloquée par
   * cette réservation, le billet est créé, l'événement BilletEmis est écrit (ADR 003, 007).
   * Renvoie null si la place n'est plus bloquée pour cette réservation.
   */
  emettreBillet(reservationId: string, paiementId: string): Promise<Billet | null>;
  marquerARembourser(reservationId: string, paiementId: string): Promise<void>;
}

/** Port vers le prestataire de paiement : couche anticorruption (carte de contexte). */
export interface PasserelleDePaiement {
  /** Lève une PaiementIndisponible si le prestataire ne peut pas répondre. */
  payer(demande: DemandePaiement): Promise<ResultatPaiement>;
}

/** Lecture du plan de salle affiché à l'acheteur (indicative, ADR 015). Null si la vente est inconnue. */
export interface LecturePlan {
  lire(evenementId: string): Promise<PlanDeSalle | null>;
}

export interface VentesEvenement {
  places: number;
  vendues: number;
  /** Bloquées et pas encore expirées. */
  bloquees: number;
  recetteCentimes: number;
}

/** Les ventes de quelques événements, pour le dashboard des organisateurs (module Organisateurs). */
export interface StatistiquesVentes {
  parEvenement(evenementIds: string[]): Promise<Map<string, VentesEvenement>>;
}

/** Port de vérification du jeton d'accès émis par la File d'attente (ADR 011). */
export interface VerificateurAdmission {
  /** Vérifie signature, émetteur, audience et expiration ; lève une AdmissionRefusee sinon. */
  verifier(jetonAcces: string): Promise<Admission>;
}

export type GenerateurId = () => string;
export type Horloge = () => Date;

export const DEPOT_SIEGES = Symbol("DepotSieges");
export const DEPOT_RESERVATIONS = Symbol("DepotReservations");
export const LECTURE_PLAN = Symbol("LecturePlan");
export const STATISTIQUES_VENTES = Symbol("StatistiquesVentes");
export const PASSERELLE_PAIEMENT = Symbol("PasserelleDePaiement");
export const VERIFICATEUR_ADMISSION = Symbol("VerificateurAdmission");
export const GENERATEUR_ID = Symbol("GenerateurId");
export const HORLOGE = Symbol("Horloge");
