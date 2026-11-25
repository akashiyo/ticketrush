import type { PasserelleDePaiement } from "../../domaine/ports.js";
import {
  type DemandePaiement,
  PaiementIndisponible,
  type ResultatPaiement,
} from "../../domaine/reservation.js";
import type { Disjoncteur } from "./disjoncteur.js";

/** Erreur qui vaut une nouvelle tentative : délai dépassé, erreur réseau ou erreur 5xx. */
class ErreurTransitoire extends Error {}

export interface OptionsPasserelle {
  url: string;
  obtenirJeton: () => Promise<string>;
  disjoncteur: Disjoncteur;
  /** Délai maximal d'un appel : 2 s (ADR 005). */
  delaiMs?: number;
  /** Nombre total d'appels, nouvelles tentatives comprises. */
  tentatives?: number;
  /** Attente de base avant une nouvelle tentative, doublée à chaque fois. */
  attenteBaseMs?: number;
  attendre?: (ms: number) => Promise<void>;
  aleatoire?: () => number;
}

/**
 * Adaptateur vers le faux prestataire de paiement (P2) : la couche anticorruption de la carte de
 * contexte. Le domaine ne connaît que le port PasserelleDePaiement ; les détails HTTP, le jeton
 * de service et le format du prestataire restent ici.
 *
 * Protections de l'ADR 005, de l'intérieur vers l'extérieur :
 * - **délai maximal** de 2 s par appel ;
 * - **nouvelles tentatives** limitées, uniquement sur erreur transitoire, avec un délai qui double
 *   et une part d'aléatoire (jitter), toujours avec la **même clé d'idempotence** ;
 * - **disjoncteur** autour de l'ensemble : prestataire en panne → refus immédiat (scénario D-1).
 */
export class PasserelleFauxPaiement implements PasserelleDePaiement {
  private readonly delaiMs: number;
  private readonly tentatives: number;
  private readonly attenteBaseMs: number;
  private readonly attendre: (ms: number) => Promise<void>;
  private readonly aleatoire: () => number;

  constructor(private readonly options: OptionsPasserelle) {
    this.delaiMs = options.delaiMs ?? 2_000;
    this.tentatives = options.tentatives ?? 3;
    this.attenteBaseMs = options.attenteBaseMs ?? 100;
    this.attendre = options.attendre ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.aleatoire = options.aleatoire ?? Math.random;
  }

  async payer(demande: DemandePaiement): Promise<ResultatPaiement> {
    try {
      return await this.options.disjoncteur.executer(() => this.avecNouvellesTentatives(demande));
    } catch (erreur) {
      throw new PaiementIndisponible(erreur);
    }
  }

  private async avecNouvellesTentatives(demande: DemandePaiement): Promise<ResultatPaiement> {
    for (let essai = 1; ; essai++) {
      try {
        return await this.appeler(demande);
      } catch (erreur) {
        if (!(erreur instanceof ErreurTransitoire) || essai >= this.tentatives) throw erreur;
        const attente = this.attenteBaseMs * 2 ** (essai - 1);
        await this.attendre(attente + this.aleatoire() * attente);
      }
    }
  }

  private async appeler(demande: DemandePaiement): Promise<ResultatPaiement> {
    let reponse: Response;
    try {
      reponse = await fetch(`${this.options.url}/paiements`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await this.options.obtenirJeton()}`,
          "content-type": "application/json",
          "idempotency-key": demande.cleIdempotence,
        },
        body: JSON.stringify({
          reference: demande.reference,
          montantCentimes: demande.montantCentimes,
          devise: "EUR",
          moyenDePaiement: { jeton: demande.moyenDePaiement.jeton },
        }),
        signal: AbortSignal.timeout(this.delaiMs),
      });
    } catch (erreur) {
      throw new ErreurTransitoire("Prestataire injoignable ou trop lent", { cause: erreur });
    }
    if (reponse.status >= 500)
      throw new ErreurTransitoire(`Prestataire en erreur (${reponse.status})`);
    if (!reponse.ok) throw new Error(`Paiement rejeté par le prestataire (${reponse.status})`);

    // Traduction du modèle du prestataire vers celui du domaine.
    const paiement = (await reponse.json()) as {
      id: string;
      statut: "accepte" | "refuse";
      motifRefus: string | null;
    };
    return paiement.statut === "accepte"
      ? { statut: "accepte", paiementId: paiement.id }
      : { statut: "refuse", motif: paiement.motifRefus ?? "refusé" };
  }
}
