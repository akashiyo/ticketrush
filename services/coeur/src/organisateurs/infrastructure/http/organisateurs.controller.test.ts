import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { creerVerificateur, VERIFICATEUR_JETON } from "../../../commun/authentification.js";
import { GestionEvenements } from "../../application/gestion-evenements.js";
import {
  ActionInterdite,
  EvenementIntrouvable,
  RegleNonRespectee,
} from "../../domaine/evenement.js";
import { OrganisateursController } from "./organisateurs.controller.js";

const EMETTEUR = "http://keycloak-test/realms/ticketrush";
const ORG = "6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e01";
const EVT = "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50";

const gestion = {
  lister: vi.fn(),
  consulter: vi.fn(),
  creer: vi.fn(),
  modifier: vi.fn(),
  changerPrix: vi.fn(),
  publier: vi.fn(),
  journal: vi.fn(),
  salles: vi.fn(),
};
let app: INestApplication;
let jeton: (roles: string[], organisationId?: string) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "kc", alg: "RS256" };
  jeton = (roles, organisationId) =>
    new SignJWT({
      realm_access: { roles },
      ...(organisationId ? { organisation_id: organisationId } : {}),
    })
      .setProtectedHeader({ alg: "RS256", kid: "kc" })
      .setIssuer(EMETTEUR)
      .setAudience("ticketrush-api")
      .setSubject("alpha.gestion")
      .setExpirationTime("5m")
      .sign(privateKey);
  const module = await Test.createTestingModule({
    controllers: [OrganisateursController],
    providers: [
      { provide: GestionEvenements, useValue: gestion },
      {
        provide: VERIFICATEUR_JETON,
        useValue: creerVerificateur(createLocalJWKSet({ keys: [jwk] }), {
          emetteur: EMETTEUR,
          audience: "ticketrush-api",
        }),
      },
    ],
  }).compile();
  app = module.createNestApplication();
  await app.init();
});

afterAll(async () => app?.close());
beforeEach(() => Object.values(gestion).forEach((f) => f.mockReset()));

const http = () => request(app.getHttpServer());
const gestionnaire = () => jeton(["organisateur-gestionnaire"], ORG);

const evenement = {
  id: EVT,
  organisationId: ORG,
  titre: "Concert",
  debutLe: new Date("2027-03-12T19:00:00Z"),
  tarifs: [],
};

describe("Back-office des organisateurs", () => {
  it("l'organisation vient du jeton : elle est passée aux cas d'usage", async () => {
    gestion.lister.mockResolvedValue([{ ...evenement, ventes: { vendues: 3 } }]);

    const reponse = await http()
      .get("/organisateur/evenements")
      .set("authorization", `Bearer ${await gestionnaire()}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body[0]).toMatchObject({
      titre: "Concert",
      debutLe: "2027-03-12T19:00:00.000Z",
      ventes: { vendues: 3 },
    });
    expect(gestion.lister).toHaveBeenCalledWith({
      organisationId: ORG,
      utilisateurId: "alpha.gestion",
      roles: ["organisateur-gestionnaire"],
    });
  });

  it("401 sans jeton, 403 pour un acheteur, 403 pour un organisateur sans organisation", async () => {
    expect((await http().get("/organisateur/evenements")).status).toBe(401);
    const acheteur = await http()
      .get("/organisateur/evenements")
      .set("authorization", `Bearer ${await jeton(["acheteur"])}`);
    expect(acheteur.status).toBe(403);
    const sansOrganisation = await http()
      .get("/organisateur/evenements")
      .set("authorization", `Bearer ${await jeton(["organisateur-admin"])}`);
    expect(sansOrganisation.status).toBe(403);
  });

  it("création : 201 ; 422 si la demande est invalide ou une règle non respectée", async () => {
    gestion.creer.mockResolvedValueOnce(evenement);
    const corps = {
      titre: "Concert",
      salleId: "c0a1e000-0000-4000-8000-000000000001",
      debutLe: "2027-03-12T20:00:00+01:00",
      tarifs: [{ libelle: "Fosse", placement: "libre", capacite: 100, prixCentimes: 4500 }],
    };
    const autorisation = { authorization: `Bearer ${await gestionnaire()}` };

    expect(
      (await http().post("/organisateur/evenements").set(autorisation).send(corps)).status,
    ).toBe(201);
    expect(gestion.creer.mock.calls[0]?.[1]).toMatchObject({
      debutLe: new Date("2027-03-12T19:00:00Z"),
      artiste: null,
    });
    expect(
      (await http().post("/organisateur/evenements").set(autorisation).send({ titre: "" })).status,
    ).toBe(422);
    gestion.creer.mockRejectedValueOnce(new RegleNonRespectee("date passée"));
    expect(
      (await http().post("/organisateur/evenements").set(autorisation).send(corps)).status,
    ).toBe(422);
  });

  it("403 pour un lecteur qui modifie, 404 pour l'événement d'une autre organisation", async () => {
    gestion.publier.mockRejectedValueOnce(new ActionInterdite());
    const lecteur = await http()
      .post(`/organisateur/evenements/${EVT}/publication`)
      .set("authorization", `Bearer ${await jeton(["organisateur-lecteur"], ORG)}`);
    expect(lecteur.status).toBe(403);

    gestion.publier.mockRejectedValueOnce(new EvenementIntrouvable());
    const autre = await http()
      .post(`/organisateur/evenements/${EVT}/publication`)
      .set("authorization", `Bearer ${await gestionnaire()}`);
    expect(autre.status).toBe(404);
  });
});
