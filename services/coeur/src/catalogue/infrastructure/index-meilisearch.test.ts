import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dockerDisponible } from "../../test/postgres-de-test.js";
import type { DocumentRecherche } from "../domaine/evenement.js";
import { construireFiltre, IndexMeilisearch } from "./index-meilisearch.js";

describe("construireFiltre", () => {
  it("traduit les critères et échappe les guillemets", () => {
    expect(
      construireFiltre({
        texte: "",
        ville: 'Lyon" OR ville = "Paris',
        genre: "Jazz",
        du: new Date("2027-03-01T00:00:00Z"),
        avant: new Date("2027-04-01T00:00:00Z"),
        page: 1,
        parPage: 20,
      }),
    ).toEqual([
      'ville = "Lyon\\" OR ville = \\"Paris"',
      'genre = "Jazz"',
      "debutLeTs >= 1803859200",
      "debutLeTs < 1806537600",
    ]);
  });
});

const doc = (id: string, titre: string, ville: string, debutLe: string): DocumentRecherche => ({
  id,
  titre,
  artiste: null,
  genre: "Pop",
  salle: "Salle",
  ville,
  debutLe,
  debutLeTs: Math.floor(new Date(debutLe).getTime() / 1000),
  prixMinCentimes: 4500,
  categories: [],
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
    await index.indexer(doc("a", "Les Électrons Libres", "Lyon", "2027-03-12T19:00:00Z"));
    await index.indexer(doc("b", "Nuit Jazz au Port", "Nantes", "2027-02-05T20:00:00Z"));
    await index.indexer(doc("c", "Électro sous les étoiles", "Lyon", "2027-06-21T20:00:00Z"));
  });

  afterAll(async () => arreter?.());

  it("lit un document indexé, ou null s'il est inconnu", async () => {
    expect((await index.lire("a"))?.version).toBe(1);
    expect(await index.lire("inconnu")).toBeNull();
  });

  it("tolère les fautes de frappe et trie par date", async () => {
    const resultat = await index.rechercher({ texte: "electrns", page: 1, parPage: 20 });
    expect(resultat.evenements.map((e) => e.id)).toEqual(["a"]);
    expect(resultat.evenements[0]).not.toHaveProperty("version");
  });

  it("filtre par ville et par dates", async () => {
    const lyon = await index.rechercher({ texte: "", ville: "Lyon", page: 1, parPage: 20 });
    expect(lyon.evenements.map((e) => e.id)).toEqual(["a", "c"]);

    const printemps = await index.rechercher({
      texte: "",
      du: new Date("2027-03-01T00:00:00Z"),
      avant: new Date("2027-04-01T00:00:00Z"),
      page: 1,
      parPage: 20,
    });
    expect(printemps.total).toBe(1);
  });
});
