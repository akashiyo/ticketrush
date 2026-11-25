import { describe, expect, it } from "vitest";

import type { VueEvenement } from "../domaine/evenement.js";
import type { MagasinVues } from "../domaine/ports.js";
import { type FaitCatalogue, ProjeterEvenement } from "./projeter-evenement.js";

/** Magasin en mémoire : même comportement qu'un vrai pour lire et remplacer une vue. */
function magasinEnMemoire(): MagasinVues & { vues: Map<string, VueEvenement> } {
  const vues = new Map<string, VueEvenement>();
  return {
    vues,
    lire: async (id) => vues.get(id) ?? null,
    ecrire: async (v) => void vues.set(v.evenementId, v),
  };
}

const vue = (version: number, titre = "Concert"): VueEvenement => ({
  evenementId: "evt-1",
  titre,
  artiste: "Artiste",
  genre: "Pop",
  salle: { nom: "Arène", ville: "Lyon" },
  debutLe: "2027-03-12T19:00:00.000Z",
  categories: [
    {
      categorieId: "fosse",
      libelle: "Fosse",
      placement: "libre",
      capacite: 3000,
      prixCentimes: 4500,
    },
    {
      categorieId: "cat1",
      libelle: "Catégorie 1",
      placement: "numerote",
      capacite: 2000,
      prixCentimes: 6500,
    },
  ],
  version,
});

describe("ProjeterEvenement", () => {
  it("met à jour toutes les vues (index et fiches)", async () => {
    const index = magasinEnMemoire();
    const fiches = magasinEnMemoire();

    await new ProjeterEvenement([index, fiches]).executer({ type: "etat", vue: vue(1) });

    expect(index.vues.get("evt-1")?.titre).toBe("Concert");
    expect(fiches.vues.get("evt-1")?.titre).toBe("Concert");
  });

  it("ignore un doublon et un fait plus ancien (livraison au moins une fois, désordre)", async () => {
    const magasin = magasinEnMemoire();
    const projeter = new ProjeterEvenement([magasin]);
    await projeter.executer({ type: "etat", vue: vue(2, "Version 2") });

    await projeter.executer({ type: "etat", vue: vue(2, "Doublon") });
    await projeter.executer({ type: "etat", vue: vue(1, "Ancienne") });

    expect(magasin.vues.get("evt-1")?.titre).toBe("Version 2");
  });

  it("applique un nouveau tarif à la vue enregistrée", async () => {
    const magasin = magasinEnMemoire();
    const projeter = new ProjeterEvenement([magasin]);
    await projeter.executer({ type: "etat", vue: vue(1) });

    await projeter.executer({
      type: "tarif",
      evenementId: "evt-1",
      categorieId: "fosse",
      prixCentimes: 9900,
      version: 2,
    });

    const v = magasin.vues.get("evt-1");
    expect(v?.categories.find((c) => c.categorieId === "fosse")?.prixCentimes).toBe(9900);
    expect(v?.version).toBe(2);
  });

  it("un magasin resté en retard (panne) est rattrapé au rejeu ; l'autre ignore le doublon", async () => {
    const index = magasinEnMemoire();
    const fiches = magasinEnMemoire();
    await new ProjeterEvenement([fiches]).executer({ type: "etat", vue: vue(1) });

    await new ProjeterEvenement([index, fiches]).executer({ type: "etat", vue: vue(1) });

    expect(index.vues.get("evt-1")?.version).toBe(1);
  });

  it("rejouer toute l'histoire donne les mêmes vues", async () => {
    const histoire: FaitCatalogue[] = [
      { type: "etat", vue: vue(1) },
      { type: "tarif", evenementId: "evt-1", categorieId: "fosse", prixCentimes: 5000, version: 2 },
      { type: "etat", vue: vue(3, "Final") },
    ];
    const magasin = magasinEnMemoire();
    const projeter = new ProjeterEvenement([magasin]);
    for (const fait of histoire) await projeter.executer(fait);
    const premierPassage = structuredClone(magasin.vues.get("evt-1"));

    for (const fait of histoire) await projeter.executer(fait);

    expect(magasin.vues.get("evt-1")).toEqual(premierPassage);
  });
});
