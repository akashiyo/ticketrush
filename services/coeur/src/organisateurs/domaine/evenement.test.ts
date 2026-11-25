import { describe, expect, it } from "vitest";

import {
  changerPrix,
  creerBrouillon,
  type Evenement,
  modifierInformations,
  type NouvelEvenement,
  peutModifier,
  publier,
  RegleNonRespectee,
} from "./evenement.js";

const MAINTENANT = new Date("2026-12-01T10:00:00Z");
const DANS_UN_MOIS = new Date("2027-01-01T20:00:00Z");

const donnees: NouvelEvenement = {
  titre: "  Concert  ",
  artiste: "Artiste",
  genre: "Pop",
  salle: { id: "salle", nom: "Arène", ville: "Lyon" },
  debutLe: DANS_UN_MOIS,
  tarifs: [{ libelle: "Fosse", placement: "libre", capacite: 3000, prixCentimes: 4500 }],
};

let compteur = 0;
const brouillon = (modif: Partial<NouvelEvenement> = {}): Evenement =>
  creerBrouillon("evt", "org", { ...donnees, ...modif }, () => `tarif-${++compteur}`, MAINTENANT);

describe("Événement d'un organisateur", () => {
  it("naît brouillon, en version 1, titre nettoyé", () => {
    const e = brouillon();
    expect(e).toMatchObject({ statut: "brouillon", version: 1, titre: "Concert" });
    expect(e.tarifs[0]?.id).toMatch(/^tarif-/);
  });

  it("refuse une date passée, un prix négatif, une catégorie vide, aucun tarif", () => {
    expect(() => brouillon({ debutLe: new Date("2026-01-01") })).toThrow(RegleNonRespectee);
    expect(() =>
      brouillon({
        tarifs: [{ libelle: "Fosse", placement: "libre", capacite: 10, prixCentimes: -1 }],
      }),
    ).toThrow(RegleNonRespectee);
    expect(() =>
      brouillon({ tarifs: [{ libelle: " ", placement: "libre", capacite: 10, prixCentimes: 0 }] }),
    ).toThrow(RegleNonRespectee);
    expect(() => brouillon({ tarifs: [] })).toThrow(RegleNonRespectee);
  });

  it("un brouillon modifié n'annonce rien ; un événement publié annonce son nouvel état", () => {
    const e = brouillon();
    expect(modifierInformations(e, { titre: "Nouveau" }, MAINTENANT)).toMatchObject({
      evenement: { titre: "Nouveau", version: 2 },
      publication: null,
    });

    const publie = publier(e, MAINTENANT).evenement;
    expect(modifierInformations(publie, { artiste: null }, MAINTENANT).publication).toBe(
      "EvenementModifie",
    );
  });

  it("publier : une seule fois, et avant la date de l'événement", () => {
    const changement = publier(brouillon(), MAINTENANT);
    expect(changement).toMatchObject({
      evenement: { statut: "publie", version: 2 },
      publication: "EvenementPublie",
    });
    expect(() => publier(changement.evenement, MAINTENANT)).toThrow(/déjà publié/);
    expect(() => publier(brouillon(), new Date("2027-02-01"))).toThrow(RegleNonRespectee);
  });

  it("changer un prix : TarifModifie si publié, catégorie inconnue refusée", () => {
    const publie = publier(brouillon(), MAINTENANT).evenement;
    const tarifId = publie.tarifs[0]!.id;

    expect(changerPrix(publie, tarifId, 5000)).toMatchObject({
      evenement: { version: 3, tarifs: [{ prixCentimes: 5000 }] },
      publication: { type: "TarifModifie", tarifId },
    });
    expect(() => changerPrix(publie, "inconnu", 5000)).toThrow(RegleNonRespectee);
  });

  it("seuls l'administrateur et le gestionnaire modifient", () => {
    const avec = (roles: string[]) =>
      peutModifier({ organisationId: "o", utilisateurId: "u", roles });
    expect(avec(["organisateur-admin"])).toBe(true);
    expect(avec(["organisateur-gestionnaire"])).toBe(true);
    expect(avec(["organisateur-lecteur"])).toBe(false);
    expect(avec(["acheteur"])).toBe(false);
  });
});
