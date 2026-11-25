import { describe, expect, it } from "vitest";

import type { DemandePaiement } from "../domaine/paiement.js";
import { DepotPaiementsMemoire } from "../infrastructure/depot-memoire.js";
import { CreerPaiement } from "./creer-paiement.js";

const demande: DemandePaiement = {
  reference: "reservation-42",
  montantCentimes: 7_500,
  devise: "EUR",
  moyenDePaiement: { jeton: "carte-acceptee" },
};

const nouveauCasDUsage = () => {
  const depot = new DepotPaiementsMemoire();
  return { depot, creer: new CreerPaiement(depot, () => new Date("2026-11-25T10:00:00Z")) };
};

describe("CreerPaiement", () => {
  it("crée et enregistre un paiement accepté", async () => {
    const { depot, creer } = nouveauCasDUsage();
    const resultat = await creer.executer("cle-1", demande);

    expect(resultat.type).toBe("cree");
    if (resultat.type !== "cree") return;
    expect(resultat.paiement).toMatchObject({
      reference: "reservation-42",
      montantCentimes: 7_500,
      statut: "accepte",
      creeLe: "2026-11-25T10:00:00.000Z",
    });
    expect(await depot.trouverParId(resultat.paiement.id)).toEqual(resultat.paiement);
  });

  it("renvoie le même paiement si la même demande est rejouée avec la même clé", async () => {
    const { creer } = nouveauCasDUsage();
    const premier = await creer.executer("cle-1", demande);
    const second = await creer.executer("cle-1", { ...demande });

    expect(second.type).toBe("rejoue");
    if (premier.type !== "cree" || second.type !== "rejoue") return;
    expect(second.paiement).toEqual(premier.paiement);
  });

  it("refuse de réutiliser une clé pour une demande différente", async () => {
    const { creer } = nouveauCasDUsage();
    await creer.executer("cle-1", demande);
    const resultat = await creer.executer("cle-1", { ...demande, montantCentimes: 9_999 });

    expect(resultat.type).toBe("conflit");
  });

  it("crée deux paiements distincts avec deux clés différentes", async () => {
    const { creer } = nouveauCasDUsage();
    const a = await creer.executer("cle-a", demande);
    const b = await creer.executer("cle-b", demande);

    if (a.type !== "cree" || b.type !== "cree") throw new Error("deux créations attendues");
    expect(a.paiement.id).not.toBe(b.paiement.id);
  });
});
