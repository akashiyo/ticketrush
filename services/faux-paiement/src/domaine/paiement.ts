/**
 * Domaine du faux prestataire de paiement.
 *
 * Il simule un prestataire externe (sous-domaine générique, ADR 002) : il décide
 * seulement d'accepter ou de refuser un paiement. Aucune donnée bancaire n'est
 * manipulée : le moyen de paiement est un simple jeton de test.
 */

/** Jeton de test qui provoque un refus. Tout autre jeton est accepté. */
export const JETON_CARTE_REFUSEE = "carte-refusee";

export type StatutPaiement = "accepte" | "refuse";

export interface DemandePaiement {
  /** Référence fournie par l'appelant, par exemple l'identifiant de la réservation. */
  reference: string;
  montantCentimes: number;
  devise: "EUR";
  moyenDePaiement: { jeton: string };
}

export interface Paiement {
  id: string;
  reference: string;
  montantCentimes: number;
  devise: "EUR";
  statut: StatutPaiement;
  motifRefus: string | null;
  creeLe: string;
}

/** Règle de décision du faux prestataire : refus si le jeton de test le demande. */
export function deciderPaiement(demande: DemandePaiement): {
  statut: StatutPaiement;
  motifRefus: string | null;
} {
  if (demande.moyenDePaiement.jeton === JETON_CARTE_REFUSEE) {
    return { statut: "refuse", motifRefus: "Carte refusée par la banque (simulation)" };
  }
  return { statut: "accepte", motifRefus: null };
}
