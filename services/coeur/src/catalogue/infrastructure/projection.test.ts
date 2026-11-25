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
  ],
  devise: "EUR" as const,
  versionEvenement: 1,
};

describe("traduireMessage (contrat → projection)", () => {
  it("EvenementPublie : vue publique complète, sans l'organisation", () => {
    const publie: EvenementPublie = { ...enveloppe, type: "EvenementPublie", donnees: etat };

    const fait = traduireMessage(JSON.stringify(publie));

    expect(fait).toEqual({
      type: "etat",
      vue: {
        evenementId: "evt-1",
        titre: "Concert",
        artiste: "Artiste",
        genre: "Pop",
        salle: { nom: "Arène du Lac", ville: "Lyon" },
        debutLe: "2027-03-12T19:00:00.000Z",
        categories: [
          {
            categorieId: "fosse",
            libelle: "Fosse",
            placement: "libre",
            capacite: 3000,
            prixCentimes: 4500,
          },
        ],
        version: 1,
      },
    });
    expect(JSON.stringify(fait)).not.toContain("org-1");
  });

  it("EvenementModifie donne un état complet, TarifModifie un changement de prix", () => {
    const modifie: EvenementModifie = {
      ...enveloppe,
      type: "EvenementModifie",
      donnees: { ...etat, versionEvenement: 2 },
    };
    const tarif: TarifModifie = {
      ...enveloppe,
      type: "TarifModifie",
      donnees: { categorieId: "fosse", prixCentimes: 5000, devise: "EUR", versionEvenement: 3 },
    };

    expect(traduireMessage(JSON.stringify(modifie))).toMatchObject({
      type: "etat",
      vue: { version: 2 },
    });
    expect(traduireMessage(JSON.stringify(tarif))).toEqual({
      type: "tarif",
      evenementId: "evt-1",
      categorieId: "fosse",
      prixCentimes: 5000,
      version: 3,
    });
  });

  it("ignore un type d'événement inconnu (lecteur tolérant)", () => {
    expect(traduireMessage(JSON.stringify({ ...enveloppe, type: "EvenementAnnule" }))).toBeNull();
  });
});
