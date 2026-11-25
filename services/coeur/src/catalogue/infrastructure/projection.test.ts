import type { EvenementModifie, EvenementPublie, TarifModifie } from "@ticketrush/contrats";
import { describe, expect, it } from "vitest";

import { traduireMessage } from "./projection.js";

const enveloppe = {
  id: "msg-1",
  versionSchema: 1 as const,
  survenuLe: "2026-11-25T10:00:00.000Z",
  evenementId: "evt-1",
  organisationId: "org-1",
};

const etat = {
  titre: "Concert",
  artiste: "Artiste",
  genre: "Pop",
  salle: { salleId: "salle-1", nom: "Arène du Lac", ville: "Lyon" },
  debutLe: "2027-03-12T19:00:00.000Z",
  categories: [
    {
      categorieId: "fosse",
      libelle: "Fosse",
      placement: "libre" as const,
      capacite: 3000,
      prixCentimes: 4500,
    },
    {
      categorieId: "cat1",
      libelle: "Cat. 1",
      placement: "numerote" as const,
      capacite: 2000,
      prixCentimes: 6500,
    },
  ],
  devise: "EUR" as const,
  versionEvenement: 1,
};

describe("traduireMessage (contrat → projection)", () => {
  it("EvenementPublie : document de recherche complet, sans données privées", () => {
    const publie: EvenementPublie = { ...enveloppe, type: "EvenementPublie", donnees: etat };

    const traduit = traduireMessage(JSON.stringify(publie));

    expect(traduit).toEqual({
      invaliderFiche: false,
      fait: {
        type: "etat",
        document: {
          id: "evt-1",
          titre: "Concert",
          artiste: "Artiste",
          genre: "Pop",
          salle: "Arène du Lac",
          ville: "Lyon",
          debutLe: "2027-03-12T19:00:00.000Z",
          debutLeTs: 1804878000,
          prixMinCentimes: 4500,
          categories: [
            { categorieId: "fosse", libelle: "Fosse", prixCentimes: 4500 },
            { categorieId: "cat1", libelle: "Cat. 1", prixCentimes: 6500 },
          ],
          version: 1,
        },
      },
    });
    expect(JSON.stringify(traduit)).not.toContain("org-1");
  });

  it("EvenementModifie et TarifModifie invalident la fiche en cache", () => {
    const modifie: EvenementModifie = { ...enveloppe, type: "EvenementModifie", donnees: etat };
    const tarif: TarifModifie = {
      ...enveloppe,
      type: "TarifModifie",
      donnees: { categorieId: "fosse", prixCentimes: 5000, devise: "EUR", versionEvenement: 2 },
    };

    expect(traduireMessage(JSON.stringify(modifie))?.invaliderFiche).toBe(true);
    expect(traduireMessage(JSON.stringify(tarif))).toEqual({
      invaliderFiche: true,
      fait: {
        type: "tarif",
        evenementId: "evt-1",
        categorieId: "fosse",
        prixCentimes: 5000,
        version: 2,
      },
    });
  });

  it("ignore un type d'événement inconnu (lecteur tolérant)", () => {
    expect(traduireMessage(JSON.stringify({ ...enveloppe, type: "EvenementAnnule" }))).toBeNull();
  });
});
