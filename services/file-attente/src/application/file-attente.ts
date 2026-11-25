import {
  type EtatAcheteur,
  estimerAttenteSec,
  prochainAppelDansSec,
  scoreEntree,
  type Vente,
} from "../domaine/file.js";
import type { DepotFile, Horloge, SignataireJeton } from "../domaine/ports.js";

export class VenteInconnueErreur extends Error {
  constructor(evenementId: string) {
    super(`Aucune vente configurée pour l'événement ${evenementId}`);
  }
}

/**
 * Cas d'usage de la file d'attente virtuelle (ADR 008, 009 et 011) :
 * entrer, consulter sa position, et admettre les premiers au débit réglé.
 */
export class FileAttente {
  constructor(
    private readonly depot: DepotFile,
    private readonly signataire: SignataireJeton,
    private readonly horloge: Horloge,
    private readonly aleatoire: () => number = Math.random,
    private readonly dureeJetonSec = 600,
  ) {}

  configurerVente(vente: Vente): Promise<void> {
    return this.depot.configurerVente(vente);
  }

  /**
   * Entrée dans la file. Idempotente : un acheteur déjà présent ou déjà admis garde
   * sa place, quel que soit le nombre d'onglets ou d'appareils (accès en double).
   */
  async entrer(evenementId: string, acheteurId: string): Promise<EtatAcheteur> {
    const vente = await this.venteOuErreur(evenementId);
    const admission = await this.depot.lireAdmission(evenementId, acheteurId);
    if (!admission) {
      const score = scoreEntree(this.horloge(), vente, this.aleatoire);
      await this.depot.entrer(evenementId, acheteurId, score);
    }
    return this.etat(vente, acheteurId);
  }

  async consulter(evenementId: string, acheteurId: string): Promise<EtatAcheteur> {
    const vente = await this.venteOuErreur(evenementId);
    return this.etat(vente, acheteurId);
  }

  /**
   * Un tour d'admission, lancé chaque seconde par le worker : pour chaque vente
   * ouverte, admet les N premiers (N = débit par seconde) et leur signe un jeton.
   * Le verrou garantit qu'une seule instance admet à chaque tour.
   */
  async admettreUnTour(): Promise<number> {
    const maintenant = this.horloge();
    let admis = 0;
    for (const evenementId of await this.depot.ventesConfigurees()) {
      const vente = await this.depot.lireVente(evenementId);
      if (!vente || maintenant < vente.ouvertureLe) continue;
      if (!(await this.depot.prendreVerrou(`admission:${evenementId}`, 900))) continue;

      const premiers = await this.depot.premiers(evenementId, vente.debitParSeconde);
      if (premiers.length === 0) continue;
      const admissions = await Promise.all(
        premiers.map(async (acheteurId) => ({
          acheteurId,
          admission: await this.signataire.signer(acheteurId, evenementId),
          dureeSec: this.dureeJetonSec,
        })),
      );
      await this.depot.admettre(evenementId, admissions);
      admis += admissions.length;
    }
    return admis;
  }

  private async etat(vente: Vente, acheteurId: string): Promise<EtatAcheteur> {
    const admission = await this.depot.lireAdmission(vente.evenementId, acheteurId);
    if (admission) {
      return { statut: "admis", ...admission };
    }
    const position = await this.depot.position(vente.evenementId, acheteurId);
    if (position === null) {
      return { statut: "absent" };
    }
    return {
      statut: "en_attente",
      position,
      attenteEstimeeSec: estimerAttenteSec(position, vente.debitParSeconde),
      prochainAppelDansSec: prochainAppelDansSec(position, vente.debitParSeconde),
      ouvertureLe: vente.ouvertureLe.toISOString(),
    };
  }

  private async venteOuErreur(evenementId: string): Promise<Vente> {
    const vente = await this.depot.lireVente(evenementId);
    if (!vente) throw new VenteInconnueErreur(evenementId);
    return vente;
  }
}
