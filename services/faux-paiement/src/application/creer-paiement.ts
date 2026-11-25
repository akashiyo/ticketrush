import { createHash, randomUUID } from "node:crypto";

import { deciderPaiement, type DemandePaiement, type Paiement } from "../domaine/paiement.js";
import type { DepotPaiements } from "../domaine/ports.js";

export type ResultatCreation =
  | { type: "cree"; paiement: Paiement }
  | { type: "rejoue"; paiement: Paiement }
  | { type: "conflit" };

/**
 * Cas d'usage : créer un paiement, de façon idempotente (ADR 005).
 *
 * Le Cœur peut renvoyer la même demande après un délai dépassé : avec la même clé
 * d'idempotence, le paiement n'est jamais créé deux fois, et la réponse d'origine
 * est renvoyée. Réutiliser une clé pour une demande différente est un conflit.
 */
export class CreerPaiement {
  constructor(
    private readonly depot: DepotPaiements,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  async executer(cleIdempotence: string, demande: DemandePaiement): Promise<ResultatCreation> {
    const empreinte = empreinteDe(demande);
    const existant = await this.depot.trouverParCle(cleIdempotence);
    if (existant) {
      return existant.empreinteRequete === empreinte
        ? { type: "rejoue", paiement: existant.paiement }
        : { type: "conflit" };
    }

    const decision = deciderPaiement(demande);
    const paiement: Paiement = {
      id: randomUUID(),
      reference: demande.reference,
      montantCentimes: demande.montantCentimes,
      devise: demande.devise,
      statut: decision.statut,
      motifRefus: decision.motifRefus,
      creeLe: this.maintenant().toISOString(),
    };
    await this.depot.enregistrer({ cleIdempotence, empreinteRequete: empreinte, paiement });
    return { type: "cree", paiement };
  }
}

/** Empreinte stable de la demande, indépendante de l'ordre des champs. */
function empreinteDe(demande: DemandePaiement): string {
  const canonique = JSON.stringify([
    demande.reference,
    demande.montantCentimes,
    demande.devise,
    demande.moyenDePaiement.jeton,
  ]);
  return createHash("sha256").update(canonique).digest("hex");
}
