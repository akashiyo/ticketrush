/**
 * Domaine de la Réservation : le blocage temporaire d'une place (ADR 003).
 *
 * La garantie « zéro survente » est portée par PostgreSQL (UPDATE conditionnel atomique et
 * contrainte d'unicité sur les billets) : le domaine décrit la demande et son résultat,
 * l'infrastructure exécute l'ordre SQL atomique.
 */

/** Un blocage dure 10 minutes : le temps de payer (ADR 003). */
export const DUREE_BLOCAGE_SEC = 10 * 60;

/** Ce que l'acheteur demande : un siège précis, ou une place quelconque d'une catégorie en placement libre. */
export type DemandeBlocage =
  | { type: "siege"; evenementId: string; siegeId: string }
  | { type: "placement-libre"; evenementId: string; categorieId: string };

/** Une place bloquée pour une réservation, jusqu'à `bloqueJusqua`. */
export interface Blocage {
  reservationId: string;
  evenementId: string;
  organisationId: string;
  siegeId: string;
  categorieId: string;
  bloqueJusqua: Date;
}

/** Droit de réserver accordé par la File d'attente, lu dans le jeton d'accès vérifié (ADR 011). */
export interface Admission {
  acheteurId: string;
  evenementId: string;
  jti: string;
  expireLe: Date;
}

/** Le jeton d'accès est absent, invalide, expiré, ou ne correspond pas à cet acheteur ou à cette vente. */
export class AdmissionRefusee extends Error {
  constructor(motif: string) {
    super(`Accès à la vente refusé : ${motif}`);
    this.name = "AdmissionRefusee";
  }
}

/** La place demandée est déjà prise, ou il ne reste aucune place libre dans la catégorie. */
export class PlaceIndisponible extends Error {
  constructor() {
    super("Place déjà prise");
    this.name = "PlaceIndisponible";
  }
}
