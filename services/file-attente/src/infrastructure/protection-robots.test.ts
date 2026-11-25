import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { demarrerRedis } from "../test/redis-de-test.js";
import { resoudreDefi } from "../test/resoudre-defi.js";
import { ProtectionRobots } from "./protection-robots.js";

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

const protection = (options: { secret?: string; actif?: boolean; horloge?: () => Date } = {}) =>
  ProtectionRobots.creer({
    redis,
    horloge: options.horloge ?? (() => new Date()),
    secret: options.secret ?? "secret-de-test",
    actif: options.actif ?? true,
    difficulte: 500, // petite difficulté : les tests restent rapides
    dureeSec: 300,
  });

describe("Protection contre les robots (ALTCHA)", () => {
  it("accepte une preuve de travail correcte", async () => {
    const p = protection();
    const preuve = await resoudreDefi(await p.creerDefi());
    expect(await p.verifier(preuve)).toBe("valide");
  });

  it("refuse de réutiliser une preuve déjà utilisée", async () => {
    const p = protection();
    const preuve = await resoudreDefi(await p.creerDefi());
    expect(await p.verifier(preuve)).toBe("valide");
    expect(await p.verifier(preuve)).toBe("deja_utilisee");
  });

  it("signale l'absence de preuve", async () => {
    expect(await protection().verifier(undefined)).toBe("absente");
    expect(await protection().verifier("")).toBe("absente");
  });

  it("refuse une preuve illisible ou une solution fausse", async () => {
    const p = protection();
    expect(await p.verifier("pas-du-base64-json")).toBe("invalide");

    const defi = await p.creerDefi();
    const fausse = Buffer.from(
      JSON.stringify({ challenge: defi, solution: { counter: 1, derivedKey: "00" } }),
    ).toString("base64");
    expect(await p.verifier(fausse)).toBe("invalide");
  });

  it("refuse un défi signé par un autre secret (défi fabriqué par un robot)", async () => {
    const preuve = await resoudreDefi(await protection({ secret: "secret-du-robot" }).creerDefi());
    expect(await protection({ secret: "secret-du-serveur" }).verifier(preuve)).toBe("invalide");
  });

  it("refuse un défi expiré", async () => {
    const ilYaUneHeure = new Date(Date.now() - 3_600_000);
    const p = protection({ horloge: () => ilYaUneHeure });
    const preuve = await resoudreDefi(await p.creerDefi());
    expect(await p.verifier(preuve)).toBe("expiree");
  });

  it("laisse tout passer quand la protection est désactivée (mode test de charge)", async () => {
    expect(await protection({ actif: false }).verifier(undefined)).toBe("valide");
  });
});
