import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RechercherEvenements } from "../../application/rechercher-evenements.js";
import { LECTURE_FICHE } from "../../domaine/ports.js";
import { CatalogueController } from "./catalogue.controller.js";

const rechercher = { executer: vi.fn() };
const fiches = { lire: vi.fn() };
let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [CatalogueController],
    providers: [
      { provide: RechercherEvenements, useValue: rechercher },
      { provide: LECTURE_FICHE, useValue: fiches },
    ],
  }).compile();
  app = module.createNestApplication();
  await app.init();
});

afterAll(async () => app?.close());

beforeEach(() => {
  rechercher.executer
    .mockReset()
    .mockResolvedValue({ total: 0, page: 1, parPage: 20, evenements: [] });
  fiches.lire.mockReset();
});

const http = () => request(app.getHttpServer());

describe("GET /catalogue/recherche (public)", () => {
  it("sans connexion, traduit les paramètres en critères ; « au » est inclus", async () => {
    const reponse = await http().get(
      "/catalogue/recherche?q=electrons&ville=Lyon&du=2027-03-01&au=2027-03-31&page=2",
    );

    expect(reponse.status).toBe(200);
    expect(rechercher.executer).toHaveBeenCalledWith({
      texte: "electrons",
      ville: "Lyon",
      du: new Date("2027-03-01T00:00:00Z"),
      avant: new Date("2027-04-01T00:00:00Z"),
      page: 2,
      parPage: 20,
    });
  });

  it("400 sur une date mal formée ou un paramètre inconnu", async () => {
    expect((await http().get("/catalogue/recherche?du=12/03/2027")).status).toBe(400);
    expect((await http().get("/catalogue/recherche?prix=1")).status).toBe(400);
    expect((await http().get("/catalogue/recherche?parPage=500")).status).toBe(400);
  });

  it("503 si l'index de recherche est indisponible", async () => {
    rechercher.executer.mockRejectedValue(new Error("Meilisearch injoignable"));
    expect((await http().get("/catalogue/recherche?q=jazz")).status).toBe(503);
  });
});

describe("GET /catalogue/evenements/:id (public)", () => {
  const ID = "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50";

  it("200 avec la fiche, 404 si inconnue, 400 si l'identifiant est invalide", async () => {
    fiches.lire.mockResolvedValueOnce({ evenementId: ID, titre: "Concert" });
    expect((await http().get(`/catalogue/evenements/${ID}`)).body).toMatchObject({
      titre: "Concert",
    });

    fiches.lire.mockResolvedValueOnce(null);
    expect((await http().get(`/catalogue/evenements/${ID}`)).status).toBe(404);
    expect((await http().get("/catalogue/evenements/abc")).status).toBe(400);
  });
});
