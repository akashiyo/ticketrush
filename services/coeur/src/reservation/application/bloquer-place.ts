import {
  AdmissionRefusee,
  type Blocage,
  type DemandeBlocage,
  DUREE_BLOCAGE_SEC,
  PlaceIndisponible,
} from "../domaine/blocage.js";
import type { DepotSieges, GenerateurId, VerificateurAdmission } from "../domaine/ports.js";

export interface CommandeBloquerPlace {
  /** L'acheteur connecté, lu dans son jeton Keycloak vérifié (ADR 010). */
  acheteurId: string;
  /** Le jeton d'accès remis par la File d'attente à l'admission (ADR 011). */
  jetonAcces: string;
  demande: DemandeBlocage;
}

/**
 * Cas d'usage : un acheteur admis bloque une place (scénarios C-1, P-2, S-2).
 *
 * 1. Le jeton d'accès est vérifié localement, sans appel réseau.
 * 2. Il doit appartenir à cet acheteur et à cette vente.
 * 3. La place est bloquée par un seul ordre SQL atomique ; si elle est prise, refus immédiat.
 */
export class BloquerPlace {
  constructor(
    private readonly verificateur: VerificateurAdmission,
    private readonly depot: DepotSieges,
    private readonly nouvelId: GenerateurId,
  ) {}

  async executer(commande: CommandeBloquerPlace): Promise<Blocage> {
    const admission = await this.verificateur.verifier(commande.jetonAcces);
    if (admission.acheteurId !== commande.acheteurId) {
      throw new AdmissionRefusee("jeton émis pour un autre acheteur");
    }
    if (admission.evenementId !== commande.demande.evenementId) {
      throw new AdmissionRefusee("jeton émis pour une autre vente");
    }

    const blocage = await this.depot.bloquer(
      commande.demande,
      { reservationId: this.nouvelId(), acheteurId: commande.acheteurId },
      DUREE_BLOCAGE_SEC,
    );
    if (!blocage) throw new PlaceIndisponible();
    return blocage;
  }
}
