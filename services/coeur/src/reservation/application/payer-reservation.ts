import {
  type Billet,
  DelaiDePaiementDepasse,
  MARGE_PAIEMENT_SEC,
  type MoyenDePaiement,
  PaiementRefuse,
  PlacePerdueApresPaiement,
  ReservationIntrouvable,
} from "../domaine/reservation.js";
import type { DepotReservations, Horloge, PasserelleDePaiement } from "../domaine/ports.js";

export interface CommandePayerReservation {
  acheteurId: string;
  reservationId: string;
  /** Clé envoyée par le navigateur (en-tête Idempotency-Key) : un double clic ne paie qu'une fois. */
  cleIdempotence: string;
  moyenDePaiement: MoyenDePaiement;
}

/**
 * Cas d'usage : payer une place bloquée, puis émettre le billet (scénarios C-1, D-1).
 *
 * Idempotence de bout en bout : la clé du navigateur est transmise au prestataire, et une
 * réservation déjà payée renvoie le billet déjà émis au lieu de payer à nouveau.
 */
export class PayerReservation {
  constructor(
    private readonly depot: DepotReservations,
    private readonly passerelle: PasserelleDePaiement,
    private readonly horloge: Horloge,
  ) {}

  async executer(commande: CommandePayerReservation): Promise<Billet> {
    const reservation = await this.depot.trouver(commande.reservationId);
    if (!reservation || reservation.acheteurId !== commande.acheteurId) {
      throw new ReservationIntrouvable();
    }
    if (reservation.billet) return reservation.billet; // déjà payée : on rejoue la réponse
    const resteMs = reservation.bloqueJusqua.getTime() - this.horloge().getTime();
    if (reservation.statut !== "en_attente_paiement" || resteMs < MARGE_PAIEMENT_SEC * 1000) {
      throw new DelaiDePaiementDepasse();
    }

    // Peut lever PaiementIndisponible : la place reste bloquée jusqu'à son expiration (D-1).
    const resultat = await this.passerelle.payer({
      reference: reservation.id,
      montantCentimes: reservation.prixCentimes,
      cleIdempotence: `${reservation.id}:${commande.cleIdempotence}`,
      moyenDePaiement: commande.moyenDePaiement,
    });
    if (resultat.statut === "refuse") throw new PaiementRefuse(resultat.motif);

    const billet = await this.depot.emettreBillet(reservation.id, resultat.paiementId);
    if (billet) return billet;

    // Une requête concurrente (double clic) a peut-être déjà émis le billet de ce paiement.
    const relue = await this.depot.trouver(reservation.id);
    if (relue?.billet) return relue.billet;
    await this.depot.marquerARembourser(reservation.id, resultat.paiementId);
    throw new PlacePerdueApresPaiement();
  }
}
