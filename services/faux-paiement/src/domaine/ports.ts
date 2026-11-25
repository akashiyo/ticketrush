import type { Paiement } from "./paiement.js";

/** Un paiement enregistré, avec l'empreinte de la requête qui l'a créé (idempotence). */
export interface PaiementEnregistre {
  cleIdempotence: string;
  empreinteRequete: string;
  paiement: Paiement;
}

/** Port de persistance des paiements, défini par le domaine (architecture hexagonale, ADR 020). */
export interface DepotPaiements {
  trouverParCle(cleIdempotence: string): Promise<PaiementEnregistre | null>;
  trouverParId(id: string): Promise<Paiement | null>;
  enregistrer(enregistrement: PaiementEnregistre): Promise<void>;
}

export const DEPOT_PAIEMENTS = Symbol("DepotPaiements");
