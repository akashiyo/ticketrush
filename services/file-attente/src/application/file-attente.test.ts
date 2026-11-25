import { createLocalJWKSet, decodeJwt, errors, jwtVerify } from "jose";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Vente } from "../domaine/file.js";
import { DepotFileRedis } from "../infrastructure/depot-redis.js";
import { AUDIENCE_RESERVATION, SignataireJose } from "../infrastructure/signataire-jose.js";
import { demarrerRedis } from "../test/redis-de-test.js";
import { FileAttente, VenteInconnueErreur } from "./file-attente.js";

const OUVERTURE = new Date("2026-12-01T10:00:00Z");
const EMETTEUR = "ticketrush-file-attente";

let redis: Redis;
let arreterRedis: () => Promise<void>;

beforeAll(async () => {
  const r = await demarrerRedis();
  redis = r.client;
  arreterRedis = r.arreter;
}, 120_000);

afterAll(async () => {
  await arreterRedis?.();
});

beforeEach(async () => {
  await redis.flushall();
});

/** Une file avec une horloge contrôlée par le test. */
async function nouvelleFile(options: { debit?: number; aleatoire?: () => number } = {}) {
  const horloge = { maintenant: new Date("2026-12-01T09:00:00Z") };
  const lireHorloge = () => horloge.maintenant;
  const signataire = await SignataireJose.creer({
    emetteur: EMETTEUR,
    dureeSec: 600,
    horloge: lireHorloge,
  });
  const file = new FileAttente(
    new DepotFileRedis(redis),
    signataire,
    lireHorloge,
    options.aleatoire,
  );
  const vente: Vente = {
    evenementId: "concert-1",
    ouvertureLe: OUVERTURE,
    debitParSeconde: options.debit ?? 2,
  };
  await file.configurerVente(vente);
  return { file, signataire, horloge };
}

describe("Entrée dans la file", () => {
  it("refuse une vente qui n'est pas configurée", async () => {
    const { file } = await nouvelleFile();
    await expect(file.entrer("concert-inconnu", "alice")).rejects.toBeInstanceOf(
      VenteInconnueErreur,
    );
  });

  it("donne une seule position par compte, même en entrant plusieurs fois", async () => {
    const { file, horloge } = await nouvelleFile();
    horloge.maintenant = new Date("2026-12-01T10:00:01Z");

    const premiere = await file.entrer("concert-1", "alice");
    const seconde = await file.entrer("concert-1", "alice"); // deuxième onglet
    await file.entrer("concert-1", "bruno");

    expect(premiere).toMatchObject({ statut: "en_attente", position: 1 });
    expect(seconde).toMatchObject({ statut: "en_attente", position: 1 });
    expect(await redis.zcard("file:concert-1")).toBe(2);
  });

  it("ne remet pas en file un acheteur déjà admis", async () => {
    const { file, horloge } = await nouvelleFile();
    horloge.maintenant = new Date("2026-12-01T10:00:01Z");
    await file.entrer("concert-1", "alice");
    await file.admettreUnTour();

    expect((await file.entrer("concert-1", "alice")).statut).toBe("admis");
    expect(await redis.zcard("file:concert-1")).toBe(0);
  });
});

describe("Position et temps d'attente", () => {
  it("affiche la position, l'attente estimée et le prochain appel", async () => {
    const { file, horloge } = await nouvelleFile({ debit: 2 });
    for (let i = 1; i <= 5; i++) {
      horloge.maintenant = new Date(OUVERTURE.getTime() + i * 1000);
      await file.entrer("concert-1", `acheteur-${i}`);
    }
    const etat = await file.consulter("concert-1", "acheteur-5");

    expect(etat).toEqual({
      statut: "en_attente",
      position: 5,
      attenteEstimeeSec: 3, // 5 acheteurs ÷ 2 par seconde
      prochainAppelDansSec: 2,
      ouvertureLe: OUVERTURE.toISOString(),
    });
  });

  it("indique « absent » pour un acheteur qui n'est pas entré", async () => {
    const { file } = await nouvelleFile();
    expect(await file.consulter("concert-1", "inconnu")).toEqual({ statut: "absent" });
  });
});

describe("Ordre d'admission", () => {
  it("n'admet personne avant l'ouverture", async () => {
    const { file } = await nouvelleFile();
    await file.entrer("concert-1", "alice");
    expect(await file.admettreUnTour()).toBe(0);
  });

  it("admet par ordre d'arrivée après l'ouverture, au débit réglé", async () => {
    const { file, horloge } = await nouvelleFile({ debit: 2 });
    for (const [i, nom] of ["alice", "bruno", "chloe", "david"].entries()) {
      horloge.maintenant = new Date(OUVERTURE.getTime() + (i + 1) * 1000);
      await file.entrer("concert-1", nom);
    }

    horloge.maintenant = new Date(OUVERTURE.getTime() + 10_000);
    expect(await file.admettreUnTour()).toBe(2);
    expect((await file.consulter("concert-1", "alice")).statut).toBe("admis");
    expect((await file.consulter("concert-1", "bruno")).statut).toBe("admis");
    expect(await file.consulter("concert-1", "chloe")).toMatchObject({ position: 1 });

    await redis.del("verrou:admission:concert-1"); // tour suivant, une seconde plus tard
    expect(await file.admettreUnTour()).toBe(2);
    expect((await file.consulter("concert-1", "david")).statut).toBe("admis");
  });

  it("fait passer la salle d'attente (tirée au sort) avant les arrivés après l'ouverture", async () => {
    const tirages = [0.9, 0.1];
    const { file, horloge } = await nouvelleFile({
      debit: 10,
      aleatoire: () => tirages.shift() ?? 0.5,
    });
    await file.entrer("concert-1", "attend-depuis-longtemps"); // avant l'ouverture, tire 0.9
    await file.entrer("concert-1", "arrive-juste-avant"); // avant l'ouverture, tire 0.1
    horloge.maintenant = new Date(OUVERTURE.getTime() + 1_000);
    await file.entrer("concert-1", "arrive-apres");

    expect(await redis.zrange("file:concert-1", 0, -1)).toEqual([
      "arrive-juste-avant",
      "attend-depuis-longtemps",
      "arrive-apres",
    ]);
  });

  it("n'admet qu'une fois par tour, même avec deux workers en parallèle (verrou)", async () => {
    const { file, horloge } = await nouvelleFile({ debit: 1 });
    horloge.maintenant = new Date(OUVERTURE.getTime() + 1_000);
    await file.entrer("concert-1", "alice");
    await file.entrer("concert-1", "bruno");

    const [a, b] = await Promise.all([file.admettreUnTour(), file.admettreUnTour()]);
    expect(a + b).toBe(1);
  });
});

describe("Jeton d'accès signé et limité dans le temps", () => {
  it("signe un jeton ES256 lié à l'acheteur et à la vente, valable 10 minutes", async () => {
    const { file, signataire, horloge } = await nouvelleFile();
    horloge.maintenant = new Date(OUVERTURE.getTime() + 1_000);
    await file.entrer("concert-1", "alice");
    await file.admettreUnTour();

    const etat = await file.consulter("concert-1", "alice");
    if (etat.statut !== "admis") throw new Error("admission attendue");
    const contenu = decodeJwt(etat.jetonAcces);

    expect(contenu).toMatchObject({
      sub: "alice",
      evt: "concert-1",
      aud: AUDIENCE_RESERVATION,
      iss: EMETTEUR,
    });
    expect(contenu.jti).toBeTruthy();
    expect((contenu.exp ?? 0) - (contenu.iat ?? 0)).toBe(600);
    expect(etat.expireLe).toBe(new Date((contenu.exp ?? 0) * 1000).toISOString());

    // Vérifiable avec la seule clé publique publiée (ce que fera le Cœur).
    const verifie = await jwtVerify(etat.jetonAcces, createLocalJWKSet(signataire.jwks()), {
      issuer: EMETTEUR,
      audience: AUDIENCE_RESERVATION,
      currentDate: horloge.maintenant,
    });
    expect(verifie.payload.sub).toBe("alice");
  });

  it("refuse le jeton une fois expiré", async () => {
    const { signataire, horloge } = await nouvelleFile();
    const { jetonAcces } = await signataire.signer("alice", "concert-1");
    const apresExpiration = new Date(horloge.maintenant.getTime() + 601_000);

    await expect(
      jwtVerify(jetonAcces, createLocalJWKSet(signataire.jwks()), {
        issuer: EMETTEUR,
        audience: AUDIENCE_RESERVATION,
        currentDate: apresExpiration,
      }),
    ).rejects.toBeInstanceOf(errors.JWTExpired);
  });

  it("efface l'admission de Redis à l'expiration du jeton", async () => {
    const { file, horloge } = await nouvelleFile();
    horloge.maintenant = new Date(OUVERTURE.getTime() + 1_000);
    await file.entrer("concert-1", "alice");
    await file.admettreUnTour();

    const ttl = await redis.ttl("admis:concert-1:alice");
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(600);
  });
});
