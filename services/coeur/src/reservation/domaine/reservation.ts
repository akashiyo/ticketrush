/**
 * Domaine de la Réservation : payer une place bloquée et recevoir son billet (ADR 003, 005).
 */

/**
 * Marge exigée avant l'expiration du blocage pour lancer un paiement. Elle couvre le pire cas
 * des nouvelles tentatives vers le prestataire (3 appels de 2 s, plus les attentes) : un
 * paiement accepté trouve toujours la place encore bloquée (point chaud n° 4 de l'Event Storming).
 */
export const MARGE_PAIEMENT_SEC = 15;

export type StatutReservation = "en_attente_paiement" | "payee" | "expiree" | "a_rembourser";

export interface Billet {
  billetId: string;
  reservationId: string;
  evenementId: string;
  siegeId: string;
  acheteurId: string;
  prixCentimes: number;
  emisLe: Date;
}

export interface Reservation {
  id: string;
  evenementId: string;
  acheteurId: string;
  siegeId: string;
  prixCentimes: number;
  bloqueJusqua: Date;
  statut: StatutReservation;
  /** Présent quand la réservation est payée. */
  billet: Billet | null;
}

/** Moyen de paiement opaque, transmis tel quel au prestataire (aucune donnée bancaire ici). */
export interface MoyenDePaiement {
  jeton: string;
}

export interface DemandePaiement {
  /** Référence chez le prestataire : l'identifiant de la réservation. */
  reference: string;
  montantCentimes: number;
  /** Une nouvelle tentative avec la même clé ne débite jamais deux fois (ADR 005). */
  cleIdempotence: string;
  moyenDePaiement: MoyenDePaiement;
}

export type ResultatPaiement =
  { statut: "accepte"; paiementId: string } | { statut: "refuse"; motif: string };

/** Réservation inconnue, ou qui appartient à un autre acheteur : même réponse, pour ne rien révéler. */
export class ReservationIntrouvable extends Error {
  constructor() {
    super("Réservation introuvable");
    this.name = "ReservationIntrouvable";
  }
}

/** Le blocage a expiré, ou expire trop tôt pour payer sans risque. */
export class DelaiDePaiementDepasse extends Error {
  constructor() {
    super("Le délai de paiement de cette réservation est dépassé");
    this.name = "DelaiDePaiementDepasse";
  }
}

export class PaiementRefuse extends Error {
  constructor(motif: string) {
    super(`Paiement refusé : ${motif}`);
    this.name = "PaiementRefuse";
  }
}

/** Le prestataire ne répond pas, répond en erreur, ou le disjoncteur est ouvert (ADR 005, D-1). */
export class PaiementIndisponible extends Error {
  constructor(cause?: unknown) {
    super("Paiement momentanément indisponible", { cause });
    this.name = "PaiementIndisponible";
  }
}

/**
 * Paiement accepté, mais la place n'est plus bloquée pour cette réservation. Aucun billet n'est
 * émis (ADR 003) ; la réservation passe « à rembourser » (compensation hors périmètre du projet).
 */
export class PlacePerdueApresPaiement extends Error {
  constructor() {
    super("La place n'est plus disponible : le paiement sera remboursé");
    this.name = "PlacePerdueApresPaiement";
  }
}
