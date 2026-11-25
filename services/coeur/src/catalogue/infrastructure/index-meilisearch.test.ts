import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dockerDisponible } from "../../test/postgres-de-test.js";
import type { VueEvenement } from "../domaine/evenement.js";
import { construireFiltre, IndexMeilisearch } from "./index-meilisearch.js";

describe("construireFiltre", () => {
  it("traduit les critères et échappe les guillemets", () => {
    expect(
      construireFiltre({
        texte: "",
        ville: 'Lyon" OR salle.ville = "Paris',
        genre: "Jazz",
        du: new Date("2027-03-01T00:00:00Z"),
        avant: new Date("2027-04-01T00:00:00Z"),
        page: 1,
        parPage: 20,
      }),
    ).toEqual([
      'salle.ville = "Lyon\\" OR salle.ville = \\"Paris"',
      'genre = "Jazz"',
      "debutLeTs >= 1803859200",
      "debutLeTs < 1806537600",
    ]);
  });
});

const vue = (id: string, titre: string, ville: string, debutLe: string): VueEvenement => ({
  evenementId: id,
  titre,
  artiste: null,
  genre: "Pop",
  salle: { nom: "Salle", ville },
  debutLe,
  categories: [
    { categorieId: "c", libelle: "Fosse", placement: "libre", capacite: 100, prixCentimes: 4500 },
  ],
  version: 1,
});

/** Sur un vrai Meilisearch, de la même version que le Compose (Testcontainers). */
describe.skipIf(!(await dockerDisponible()))("IndexMeilisearch (Meilisearch réel)", () => {
  let index: IndexMeilisearch;
  let arreter: () => Promise<unknown>;

  beforeAll(async () => {
    const conteneur = await new GenericContainer("getmeili/meilisearch:v1.15")
      .withEnvironment({ MEILI_MASTER_KEY: "cle-de-test-assez-longue", MEILI_NO_ANALYTICS: "true" })
      .withExposedPorts(7700)
      .withWaitStrategy(Wait.forHttp("/health", 7700))
      .start();
    arreter = () => conteneur.stop();
    index = IndexMeilisearch.creer(
      `http://${conteneur.getHost()}:${conteneur.getMappedPort(7700)}`,
      "cle-de-test-assez-longue",
    );
    await index.ecrire(vue("a", "Les Électrons Libres", "Lyon", "2027-03-12T19:00:00Z"));
    await index.ecrire(vue("b", "Nuit Jazz au Port", "Nantes", "2027-02-05T20:00:00Z"));
    await index.ecrire(vue("c", "Électro sous les étoiles", "Lyon", "2027-06-21T20:00:00Z"));
  });

  afterAll(async () => arreter?.());

  it("relit la vue écrite, ou null si l'événement est inconnu", async () => {
    expect(await index.lire("a")).toEqual(
      vue("a", "Les Électrons Libres", "Lyon", "2027-03-12T19:00:00Z"),
    );
    expect(await index.lire("inconnu")).toBeNull();
  });

  it("tolère les fautes de frappe ; renvoie le prix « à partir de »", async () => {
    const resultat = await index.rechercher({ texte: "electrns", page: 1, parPage: 20 });
    expect(resultat.evenements).toMatchObject([{ id: "a", ville: "Lyon", prixMinCentimes: 4500 }]);
  });

  it("filtre par ville et par dates, trie par date", async () => {
    const lyon = await index.rechercher({ texte: "", ville: "Lyon", page: 1, parPage: 20 });
    expect(lyon.evenements.map((e) => e.id)).toEqual(["a", "c"]);

    const mars = await index.rechercher({
      texte: "",
      du: new Date("2027-03-01T00:00:00Z"),
      avant: new Date("2027-04-01T00:00:00Z"),
      page: 1,
      parPage: 20,
    });
    expect(mars.total).toBe(1);
  });
});
