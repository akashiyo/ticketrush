import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { creerVerificateur, VERIFICATEUR_JETON } from "../../../commun/authentification.js";
import { BloquerPlace } from "../../application/bloquer-place.js";
import { PayerReservation } from "../../application/payer-reservation.js";
import { AdmissionRefusee, PlaceIndisponible } from "../../domaine/blocage.js";
import { LECTURE_PLAN } from "../../domaine/ports.js";
import { PaiementIndisponible, PaiementRefuse } from "../../domaine/reservation.js";
import { ReservationsController } from "./reservations.controller.js";

const EMETTEUR = "http://keycloak-test/realms/ticketrush";
const EVENEMENT = "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50";
const SIEGE = "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e99";
const RESERVATION = "11111111-2222-4333-8444-555555555555";

/** Les cas d'usage sont remplacés par des doublures : ce test vérifie la couche HTTP seule. */
const bloquerPlace = { executer: vi.fn() };
const payerReservation = { executer: vi.fn() };
const lecturePlan = { lire: vi.fn() };

let app: INestApplication;
let jetonKeycloak: (roles: string[]) => Promise<string>;

beforeAll(async () => {
  // Une paire de clés de test remplace Keycloak : les jetons sont vraiment signés et vérifiés.
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "kc-test", alg: "RS256" };
  jetonKeycloak = (roles) =>
    new SignJWT({ realm_access: { roles } })
      .setProtectedHeader({ alg: "RS256", kid: "kc-test" })
      .setIssuer(EMETTEUR)
      .setAudience("ticketrush-api")
      .setSubject("acheteur-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  const module = await Test.createTestingModule({
    controllers: [ReservationsController],
    providers: [
      { provide: BloquerPlace, useValue: bloquerPlace },
      { provide: PayerReservation, useValue: payerReservation },
      { provide: LECTURE_PLAN, useValue: lecturePlan },
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

beforeEach(() => {
  bloquerPlace.executer.mockReset();
  payerReservation.executer.mockReset();
});

const http = () => request(app.getHttpServer());

describe("POST /evenements/:id/blocages", () => {
  const bloquer = async (corps: object, entetes: Record<string, string> = {}) =>
    http()
      .post(`/evenements/${EVENEMENT}/blocages`)
      .set({
        authorization: `Bearer ${await jetonKeycloak(["acheteur"])}`,
        "jeton-acces": "jeton-de-la-file",
        ...entetes,
      })
      .send(corps);

  it("201 : bloque le siège demandé pour l'acheteur connecté", async () => {
    bloquerPlace.executer.mockResolvedValue({
      reservationId: RESERVATION,
      siegeId: SIEGE,
      categorieId: "cat",
      bloqueJusqua: new Date("2026-12-01T10:10:00Z"),
    });

    const reponse = await bloquer({ siegeId: SIEGE });

    expect(reponse.status).toBe(201);
    expect(reponse.body).toMatchObject({
      reservationId: RESERVATION,
      bloqueJusqua: "2026-12-01T10:10:00.000Z",
    });
    expect(bloquerPlace.executer).toHaveBeenCalledWith({
      acheteurId: "acheteur-1",
      jetonAcces: "jeton-de-la-file",
      demande: { type: "siege", evenementId: EVENEMENT, siegeId: SIEGE },
    });
  });

  it("401 sans connexion, 403 sans le rôle acheteur", async () => {
    expect((await http().post(`/evenements/${EVENEMENT}/blocages`).send({})).status).toBe(401);
    const sansRole = await http()
      .post(`/evenements/${EVENEMENT}/blocages`)
      .set("authorization", `Bearer ${await jetonKeycloak(["organisateur-lecteur"])}`)
      .send({ siegeId: SIEGE });
    expect(sansRole.status).toBe(403);
  });

  it("403 sans jeton d'accès de la file", async () => {
    const reponse = await bloquer({ siegeId: SIEGE }, { "jeton-acces": "" });
    expect(reponse.status).toBe(403);
    expect(bloquerPlace.executer).not.toHaveBeenCalled();
  });

  it("400 sur une demande mal formée", async () => {
    expect((await bloquer({ siegeId: "pas-un-uuid" })).status).toBe(400);
    expect((await bloquer({ siegeId: SIEGE, categorieId: SIEGE })).status).toBe(400);
  });

  it("403 jeton refusé, 409 place déjà prise", async () => {
    bloquerPlace.executer.mockRejectedValueOnce(new AdmissionRefusee("jeton expiré"));
    expect((await bloquer({ siegeId: SIEGE })).status).toBe(403);
    bloquerPlace.executer.mockRejectedValueOnce(new PlaceIndisponible());
    expect((await bloquer({ siegeId: SIEGE })).status).toBe(409);
  });
});

describe("GET /evenements/:id/plan", () => {
  const lirePlan = async (evenementId = EVENEMENT) =>
    http()
      .get(`/evenements/${evenementId}/plan`)
      .set("authorization", `Bearer ${await jetonKeycloak(["acheteur"])}`);

  it("200 : renvoie le plan de la vente", async () => {
    lecturePlan.lire.mockResolvedValue({ evenementId: EVENEMENT, categories: [] });
    const reponse = await lirePlan();
    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ evenementId: EVENEMENT, categories: [] });
  });

  it("404 pour une vente inconnue, 400 pour un identifiant invalide", async () => {
    lecturePlan.lire.mockResolvedValue(null);
    expect((await lirePlan()).status).toBe(404);
    expect((await lirePlan("pas-un-uuid")).status).toBe(400);
  });
});

describe("POST /reservations/:id/paiement", () => {
  const payer = async (entetes: Record<string, string> = { "idempotency-key": "cle-0001-abc" }) =>
    http()
      .post(`/reservations/${RESERVATION}/paiement`)
      .set({ authorization: `Bearer ${await jetonKeycloak(["acheteur"])}`, ...entetes })
      .send({ moyenDePaiement: { jeton: "carte-acceptee" } });

  it("201 : renvoie le billet", async () => {
    payerReservation.executer.mockResolvedValue({
      billetId: "b",
      reservationId: RESERVATION,
      evenementId: EVENEMENT,
      siegeId: SIEGE,
      acheteurId: "acheteur-1",
      prixCentimes: 6500,
      emisLe: new Date("2026-12-01T10:05:00Z"),
    });

    const reponse = await payer();

    expect(reponse.status).toBe(201);
    expect(reponse.body).toMatchObject({ billetId: "b", emisLe: "2026-12-01T10:05:00.000Z" });
    expect(payerReservation.executer).toHaveBeenCalledWith(
      expect.objectContaining({ cleIdempotence: "cle-0001-abc", acheteurId: "acheteur-1" }),
    );
  });

  it("400 sans en-tête Idempotency-Key", async () => {
    expect((await payer({})).status).toBe(400);
    expect(payerReservation.executer).not.toHaveBeenCalled();
  });

  it("402 paiement refusé, 503 prestataire indisponible (D-1)", async () => {
    payerReservation.executer.mockRejectedValueOnce(new PaiementRefuse("carte refusée"));
    expect((await payer()).status).toBe(402);
    payerReservation.executer.mockRejectedValueOnce(new PaiementIndisponible());
    expect((await payer()).status).toBe(503);
  });
});
