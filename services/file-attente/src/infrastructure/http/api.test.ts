import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module.js";
import { FileAttente } from "../../application/file-attente.js";
import { demarrerRedis } from "../../test/redis-de-test.js";
import { resoudreDefi } from "../../test/resoudre-defi.js";
import { AUDIENCE_RESERVATION } from "../signataire-jose.js";
import { creerVerificateur, VERIFICATEUR_JETON } from "./authentification.js";

const EMETTEUR_KEYCLOAK = "http://keycloak-test/realms/ticketrush";

let app: INestApplication;
let arreterRedis: () => Promise<void>;
let jetonKeycloak: (sub: string, roles: string[]) => Promise<string>;

beforeAll(async () => {
  const redis = await demarrerRedis();
  arreterRedis = redis.arreter;
  process.env.REDIS_URL = redis.url;
  process.env.ADMISSION_INTERVALLE_MS = "0"; // le test déclenche lui-même les admissions
  process.env.ALTCHA_DIFFICULTE = "500"; // petite difficulté : les tests restent rapides

  // Une paire de clés de test remplace Keycloak : les jetons sont vraiment signés et vérifiés.
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "kc-test", alg: "RS256" };
  jetonKeycloak = (sub, roles) =>
    new SignJWT({ realm_access: { roles } })
      .setProtectedHeader({ alg: "RS256", kid: "kc-test" })
      .setIssuer(EMETTEUR_KEYCLOAK)
      .setAudience("ticketrush-api")
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(VERIFICATEUR_JETON)
    .useValue(
      creerVerificateur(createLocalJWKSet({ keys: [jwk] }), {
        emetteur: EMETTEUR_KEYCLOAK,
        audience: "ticketrush-api",
      }),
    )
    .compile();
  app = module.createNestApplication();
  await app.init();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await arreterRedis?.();
});

const http = () => request(app.getHttpServer());

/** Demande un défi ALTCHA et le résout, comme le navigateur avant d entrer. */
const preuve = async (jeton: string) => {
  const { body } = await http()
    .get("/files/concert-api/defi")
    .auth(jeton, { type: "bearer" })
    .expect(200);
  return resoudreDefi(body);
};
const entrer = async (evenementId: string, jeton: string) =>
  http()
    .post(`/files/${evenementId}/entrer`)
    .auth(jeton, { type: "bearer" })
    .send({ altcha: await preuve(jeton) });
const configurer = async (evenementId: string, ouvertureLe: Date, debitParSeconde = 10) =>
  http()
    .put(`/files/${evenementId}/vente`)
    .auth(await jetonKeycloak("orga-1", ["acheteur", "organisateur-admin"]), { type: "bearer" })
    .send({ ouvertureLe: ouvertureLe.toISOString(), debitParSeconde });

describe("File d'attente — API", () => {
  it("répond sur /sante et publie sa clé publique, sans authentification", async () => {
    await http().get("/sante").expect(200, { statut: "ok" });
    const { body } = await http().get("/.well-known/jwks.json").expect(200);
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({ alg: "ES256", kty: "EC", crv: "P-256", use: "sig" });
    expect(body.keys[0].d).toBeUndefined(); // jamais la partie privée
  });

  it("exige un compte connecté pour entrer dans la file", async () => {
    await http().post("/files/concert-api/entrer").expect(401);
  });

  it("exige le rôle acheteur pour entrer dans la file", async () => {
    await http()
      .post("/files/concert-api/entrer")
      .auth(await jetonKeycloak("orga-1", ["organisateur-lecteur"]), { type: "bearer" })
      .expect(403);
  });

  it("réserve la configuration de la vente à un organisateur administrateur", async () => {
    await http()
      .put("/files/concert-api/vente")
      .auth(await jetonKeycloak("alice", ["acheteur"]), { type: "bearer" })
      .send({ ouvertureLe: new Date().toISOString(), debitParSeconde: 10 })
      .expect(403);
    const invalide = await http()
      .put("/files/concert-api/vente")
      .auth(await jetonKeycloak("orga-1", ["organisateur-admin"]), { type: "bearer" })
      .send({ ouvertureLe: "pas-une-date", debitParSeconde: 0 })
      .expect(400);
    expect(invalide.body.erreurs.map((e: { champ: string }) => e.champ)).toEqual([
      "ouvertureLe",
      "debitParSeconde",
    ]);
  });

  it("répond 404 pour une vente non configurée", async () => {
    await entrer("concert-inconnu", await jetonKeycloak("alice", ["acheteur"])).then((r) =>
      expect(r.status).toBe(404),
    );
  });

  it("exige une preuve de travail ALTCHA pour entrer dans la file", async () => {
    await configurer("concert-robots", new Date(Date.now() - 60_000));
    const robot = await jetonKeycloak("robot", ["acheteur"]);
    await http()
      .post("/files/concert-robots/entrer")
      .auth(robot, { type: "bearer" })
      .send({})
      .expect(400);
    await http()
      .post("/files/concert-robots/entrer")
      .auth(robot, { type: "bearer" })
      .send({ altcha: "fausse-preuve" })
      .expect(403);
  });

  it("refuse de réutiliser la même preuve de travail", async () => {
    await configurer("concert-robots", new Date(Date.now() - 60_000));
    const robot = await jetonKeycloak("robot-2", ["acheteur"]);
    const unePreuve = await preuve(robot);
    const envoyer = () =>
      http()
        .post("/files/concert-robots/entrer")
        .auth(robot, { type: "bearer" })
        .send({ altcha: unePreuve });
    await envoyer().expect(200);
    await envoyer().expect(403);
  });

  it("parcours complet : entrée, position, admission, jeton vérifiable", async () => {
    await configurer("concert-api", new Date(Date.now() - 60_000)).then((r) =>
      expect(r.status).toBe(204),
    );
    const alice = await jetonKeycloak("alice", ["acheteur"]);
    const bruno = await jetonKeycloak("bruno", ["acheteur"]);

    const entreeAlice = await entrer("concert-api", alice);
    expect(entreeAlice.status).toBe(200);
    expect(entreeAlice.body).toMatchObject({
      statut: "en_attente",
      position: 1,
      attenteEstimeeSec: 1,
    });
    const entreeBruno = await entrer("concert-api", bruno);
    expect(entreeBruno.status).toBe(200);
    expect(entreeBruno.body.position).toBe(2);

    // Accès en double : Alice entre de nouveau, elle garde sa place.
    const doublon = await entrer("concert-api", alice);
    expect(doublon.status).toBe(200);
    expect(doublon.body.position).toBe(1);

    await app.get(FileAttente).admettreUnTour();

    const admis = await http()
      .get("/files/concert-api/position")
      .auth(alice, { type: "bearer" })
      .expect(200);
    expect(admis.body.statut).toBe("admis");
    const jwks = (await http().get("/.well-known/jwks.json")).body;
    const { payload } = await jwtVerify(admis.body.jetonAcces, createLocalJWKSet(jwks), {
      issuer: "ticketrush-file-attente",
      audience: AUDIENCE_RESERVATION,
    });
    expect(payload).toMatchObject({ sub: "alice", evt: "concert-api" });
  });
});
