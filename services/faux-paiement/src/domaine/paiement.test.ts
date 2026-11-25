import { describe, expect, it } from "vitest";

import { deciderPaiement, type DemandePaiement, JETON_CARTE_REFUSEE } from "./paiement.js";

const demande = (jeton: string): DemandePaiement => ({
  reference: "reservation-1",
  montantCentimes: 5_000,
  devise: "EUR",
  moyenDePaiement: { jeton },
});

describe("deciderPaiement", () => {
  it("accepte un paiement avec un jeton de carte ordinaire", () => {
    expect(deciderPaiement(demande("carte-acceptee"))).toEqual({
      statut: "accepte",
      motifRefus: null,
    });
  });

  it("refuse un paiement avec le jeton de test de carte refusée", () => {
    const decision = deciderPaiement(demande(JETON_CARTE_REFUSEE));
    expect(decision.statut).toBe("refuse");
    expect(decision.motifRefus).toBeTruthy();
  });
});
