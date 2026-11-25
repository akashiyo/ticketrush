import type { Admission, Blocage, DemandeBlocage } from "./blocage.js";

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

/** Port de vérification du jeton d'accès émis par la File d'attente (ADR 011). */
export interface VerificateurAdmission {
  /** Vérifie signature, émetteur, audience et expiration ; lève une AdmissionRefusee sinon. */
  verifier(jetonAcces: string): Promise<Admission>;
}

export type GenerateurId = () => string;

export const DEPOT_SIEGES = Symbol("DepotSieges");
export const VERIFICATEUR_ADMISSION = Symbol("VerificateurAdmission");
export const GENERATEUR_ID = Symbol("GenerateurId");
