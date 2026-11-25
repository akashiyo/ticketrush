import type { Paiement } from "../domaine/paiement.js";
import type { DepotPaiements, PaiementEnregistre } from "../domaine/ports.js";

/**
 * Dépôt en mémoire. Suffisant pour un prestataire SIMULÉ : un arrêt du service
 * efface les paiements, comme on peut s'y attendre quand le comité le coupe en
 * soutenance. Un vrai prestataire persisterait ses paiements.
 */
export class DepotPaiementsMemoire implements DepotPaiements {
  private readonly parCle = new Map<string, PaiementEnregistre>();
  private readonly parId = new Map<string, Paiement>();

  async trouverParCle(cleIdempotence: string): Promise<PaiementEnregistre | null> {
    return this.parCle.get(cleIdempotence) ?? null;
  }

  async trouverParId(id: string): Promise<Paiement | null> {
    return this.parId.get(id) ?? null;
  }

  async enregistrer(enregistrement: PaiementEnregistre): Promise<void> {
    this.parCle.set(enregistrement.cleIdempotence, enregistrement);
    this.parId.set(enregistrement.paiement.id, enregistrement.paiement);
  }
}
