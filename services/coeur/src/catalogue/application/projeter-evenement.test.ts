import { describe, expect, it } from "vitest";

import type { DocumentRecherche } from "../domaine/evenement.js";
import type { IndexRecherche } from "../domaine/ports.js";
import { ProjeterEvenement } from "./projeter-evenement.js";

/** Index en mémoire : même comportement que Meilisearch pour lire et remplacer un document. */
function indexEnMemoire(): IndexRecherche & { documents: Map<string, DocumentRecherche> } {
  const documents = new Map<string, DocumentRecherche>();
  return {
    documents,
    lire: async (id) => documents.get(id) ?? null,
    indexer: async (d) => void documents.set(d.id, d),
    rechercher: async () => ({ total: 0, page: 1, parPage: 20, evenements: [] }),
  };
}

const document = (version: number, titre = "Concert"): DocumentRecherche => ({
  id: "evt-1",
  titre,
  artiste: "Artiste",
  genre: "Pop",
  salle: "Arène",
  ville: "Lyon",
  debutLe: "2027-03-12T19:00:00.000Z",
  debutLeTs: 1_804_878_000,
  prixMinCentimes: 4500,
  categories: [
    { categorieId: "fosse", libelle: "Fosse", prixCentimes: 4500 },
    { categorieId: "cat1", libelle: "Catégorie 1", prixCentimes: 6500 },
  ],
  version,
});

describe("ProjeterEvenement", () => {
  it("indexe un événement publié", async () => {
    const index = indexEnMemoire();
    expect(
      await new ProjeterEvenement(index).executer({ type: "etat", document: document(1) }),
    ).toBe("indexe");
    expect(index.documents.get("evt-1")?.titre).toBe("Concert");
  });

  it("ignore un doublon et un événement plus ancien (livraison au moins une fois, désordre)", async () => {
    const index = indexEnMemoire();
    const projeter = new ProjeterEvenement(index);
    await projeter.executer({ type: "etat", document: document(2, "Version 2") });

    expect(await projeter.executer({ type: "etat", document: document(2, "Doublon") })).toBe(
      "ignore",
    );
    expect(await projeter.executer({ type: "etat", document: document(1, "Ancienne") })).toBe(
      "ignore",
    );
    expect(index.documents.get("evt-1")?.titre).toBe("Version 2");
  });

  it("applique un nouveau tarif et recalcule le prix « à partir de »", async () => {
    const index = indexEnMemoire();
    const projeter = new ProjeterEvenement(index);
    await projeter.executer({ type: "etat", document: document(1) });

    await projeter.executer({
      type: "tarif",
      evenementId: "evt-1",
      categorieId: "fosse",
      prixCentimes: 9900,
      version: 2,
    });

    const indexe = index.documents.get("evt-1");
    expect(indexe?.categories.find((c) => c.categorieId === "fosse")?.prixCentimes).toBe(9900);
    expect(indexe?.prixMinCentimes).toBe(6500);
    expect(indexe?.version).toBe(2);
  });

  it("rejouer toute l'histoire donne le même index", async () => {
    const histoire = [
      { type: "etat", document: document(1) },
      { type: "tarif", evenementId: "evt-1", categorieId: "fosse", prixCentimes: 5000, version: 2 },
      { type: "etat", document: document(3, "Final") },
    ] as const;
    const index = indexEnMemoire();
    const projeter = new ProjeterEvenement(index);
    for (const fait of histoire) await projeter.executer(fait);
    const premierPassage = structuredClone(index.documents.get("evt-1"));

    for (const fait of histoire) await projeter.executer(fait);

    expect(index.documents.get("evt-1")).toEqual(premierPassage);
  });
});
