import type { Redis } from "ioredis";

import type { Cache } from "./lecture-fiche-en-cache.js";

/** Le cache des fiches dans Redis (ADR 015). */
export class CacheRedis implements Cache {
  constructor(private readonly redis: Redis) {}

  lire(cle: string): Promise<string | null> {
    return this.redis.get(cle);
  }

  async ecrire(cle: string, valeur: string, dureeSec: number): Promise<void> {
    await this.redis.set(cle, valeur, "EX", dureeSec);
  }

  async prendreVerrou(cle: string, dureeMs: number): Promise<boolean> {
    return (await this.redis.set(cle, "1", "PX", dureeMs, "NX")) === "OK";
  }

  async supprimer(cle: string): Promise<void> {
    await this.redis.del(cle);
  }
}
