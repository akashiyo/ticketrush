import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module.js";
import { JETON_CARTE_REFUSEE } from "../../domaine/paiement.js";
import { creerVerificateur, VERIFICATEUR_JETON } from "./jeton-service.guard.js";

const EMETTEUR = "http://keycloak-test/realms/ticketrush";
const AUDIENCE = "ticketrush-faux-paiement";

let app: INestApplication;
let signer: (options?: { audience?: string; expiration?: string }) => Promise<string>;

beforeAll(async () => {
  // Une paire de clés de test remplace Keycloak : les jetons sont vraiment signés et vérifiés.
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "cle-test", alg: "RS256" };
  signer = ({ audience = AUDIENCE, expiration = "5m" } = {}) =>
    new SignJWT({ azp: "ticketrush-coeur" })
      .setProtectedHeader({ alg: "RS256", kid: "cle-test" })
      .setIssuer(EMETTEUR)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(privateKey);

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(VERIFICATEUR_JETON)
    .useValue(
      creerVerificateur(createLocalJWKSet({ keys: [jwk] }), {
        emetteur: EMETTEUR,
        audience: AUDIENCE,
      }),
    )
    .compile();
  app = module.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

const demande = (jeton = "carte-acceptee") => ({
  reference: "reservation-1",
  montantCentimes: 4_200,
  devise: "EUR",
  moyenDePaiement: { jeton },
});

describe("Faux prestataire de paiement — API", () => {
  it("répond sur /sante sans authentification", async () => {
    await request(app.getHttpServer()).get("/sante").expect(200, { statut: "ok" });
  });

  it("refuse un appel sans jeton de service", async () => {
    await request(app.getHttpServer()).post("/paiements").send(demande()).expect(401);
  });

  it("refuse un jeton destiné à un autre service", async () => {
    await request(app.getHttpServer())
      .post("/paiements")
      .auth(await signer({ audience: "ticketrush-api" }), { type: "bearer" })
      .set("Idempotency-Key", "cle-audience")
      .send(demande())
      .expect(401);
  });

  it("refuse un jeton expiré", async () => {
    await request(app.getHttpServer())
      .post("/paiements")
      .auth(await signer({ expiration: "-1m" }), { type: "bearer" })
      .set("Idempotency-Key", "cle-expire")
      .send(demande())
      .expect(401);
  });

  it("exige l'en-tête Idempotency-Key", async () => {
    await request(app.getHttpServer())
      .post("/paiements")
      .auth(await signer(), { type: "bearer" })
      .send(demande())
      .expect(400);
  });

  it("rejette une demande invalide", async () => {
    const reponse = await request(app.getHttpServer())
      .post("/paiements")
      .auth(await signer(), { type: "bearer" })
      .set("Idempotency-Key", "cle-invalide")
      .send({ ...demande(), montantCentimes: -5 })
      .expect(400);
    expect(reponse.body.erreurs[0].champ).toBe("montantCentimes");
  });

  it("accepte un paiement, puis le relit par son identifiant", async () => {
    const jeton = await signer();
    const creation = await request(app.getHttpServer())
      .post("/paiements")
      .auth(jeton, { type: "bearer" })
      .set("Idempotency-Key", "cle-accepte")
      .send(demande())
      .expect(201);
    expect(creation.body).toMatchObject({
      statut: "accepte",
      montantCentimes: 4_200,
      motifRefus: null,
    });

    const lecture = await request(app.getHttpServer())
      .get(`/paiements/${creation.body.id}`)
      .auth(jeton, { type: "bearer" })
      .expect(200);
    expect(lecture.body).toEqual(creation.body);
  });

  it("refuse un paiement avec le jeton de carte refusée", async () => {
    const reponse = await request(app.getHttpServer())
      .post("/paiements")
      .auth(await signer(), { type: "bearer" })
      .set("Idempotency-Key", "cle-refuse")
      .send(demande(JETON_CARTE_REFUSEE))
      .expect(201);
    expect(reponse.body.statut).toBe("refuse");
  });

  it("rejoue la même réponse pour la même clé, sans créer de second paiement", async () => {
    const jeton = await signer();
    const premiere = await request(app.getHttpServer())
      .post("/paiements")
      .auth(jeton, { type: "bearer" })
      .set("Idempotency-Key", "cle-rejeu")
      .send(demande())
      .expect(201);
    const seconde = await request(app.getHttpServer())
      .post("/paiements")
      .auth(jeton, { type: "bearer" })
      .set("Idempotency-Key", "cle-rejeu")
      .send(demande())
      .expect(201);
    expect(seconde.headers["idempotent-replayed"]).toBe("true");
    expect(seconde.body).toEqual(premiere.body);
  });

  it("signale un conflit si la clé est réutilisée pour une autre demande", async () => {
    const jeton = await signer();
    await request(app.getHttpServer())
      .post("/paiements")
      .auth(jeton, { type: "bearer" })
      .set("Idempotency-Key", "cle-conflit")
      .send(demande())
      .expect(201);
    await request(app.getHttpServer())
      .post("/paiements")
      .auth(jeton, { type: "bearer" })
      .set("Idempotency-Key", "cle-conflit")
      .send({ ...demande(), montantCentimes: 9_999 })
      .expect(422);
  });

  it("renvoie 404 pour un paiement inconnu", async () => {
    await request(app.getHttpServer())
      .get("/paiements/inconnu")
      .auth(await signer(), { type: "bearer" })
      .expect(404);
  });
});
