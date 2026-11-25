import type { Redis } from "ioredis";

import type { Vente } from "../domaine/file.js";
import type { Admission, DepotFile } from "../domaine/ports.js";

/**
 * Stockage de la file dans Redis (ADR 008).
 *
 * - `file:{evenement}`           sorted set : acheteurs triés par score d'entrée
 * - `admis:{evenement}:{acheteur}` jeton d'accès, expire avec le jeton
 * - `vente:{evenement}`          hash : ouverture et débit d'admission
 * - `ventes`                     set des ventes configurées
 * - `verrou:{nom}`               verrou de courte durée du worker d'admission
 */
export class DepotFileRedis implements DepotFile {
  constructor(private readonly redis: Redis) {}

  async configurerVente(vente: Vente): Promise<void> {
    await this.redis
      .multi()
      .hset(`vente:${vente.evenementId}`, {
        ouvertureLe: vente.ouvertureLe.getTime(),
        debitParSeconde: vente.debitParSeconde,
      })
      .sadd("ventes", vente.evenementId)
      .exec();
  }

  async lireVente(evenementId: string): Promise<Vente | null> {
    const h = await this.redis.hgetall(`vente:${evenementId}`);
    if (!h.ouvertureLe || !h.debitParSeconde) return null;
    return {
      evenementId,
      ouvertureLe: new Date(Number(h.ouvertureLe)),
      debitParSeconde: Number(h.debitParSeconde),
    };
  }

  ventesConfigurees(): Promise<string[]> {
    return this.redis.smembers("ventes");
  }

  async entrer(evenementId: string, acheteurId: string, score: number): Promise<void> {
    // NX : n'ajoute jamais un acheteur déjà présent, et ne change pas sa place.
    await this.redis.zadd(`file:${evenementId}`, "NX", score, acheteurId);
  }

  async position(evenementId: string, acheteurId: string): Promise<number | null> {
    const rang = await this.redis.zrank(`file:${evenementId}`, acheteurId);
    return rang === null ? null : rang + 1;
  }

  premiers(evenementId: string, nombre: number): Promise<string[]> {
    return this.redis.zrange(`file:${evenementId}`, 0, nombre - 1);
  }

  longueur(evenementId: string): Promise<number> {
    return this.redis.zcard(`file:${evenementId}`);
  }

  async admettre(
    evenementId: string,
    admissions: { acheteurId: string; admission: Admission; dureeSec: number }[],
  ): Promise<void> {
    // Une seule transaction : un acheteur n'est retiré de la file que si son
    // admission est enregistrée en même temps. Aucun acheteur perdu en cas de panne.
    const transaction = this.redis.multi();
    for (const { acheteurId, admission, dureeSec } of admissions) {
      transaction.set(
        `admis:${evenementId}:${acheteurId}`,
        JSON.stringify(admission),
        "EX",
        dureeSec,
      );
    }
    transaction.zrem(`file:${evenementId}`, ...admissions.map((a) => a.acheteurId));
    await transaction.exec();
  }

  async lireAdmission(evenementId: string, acheteurId: string): Promise<Admission | null> {
    const brut = await this.redis.get(`admis:${evenementId}:${acheteurId}`);
    return brut ? (JSON.parse(brut) as Admission) : null;
  }

  async prendreVerrou(nom: string, dureeMs: number): Promise<boolean> {
    return (await this.redis.set(`verrou:${nom}`, "1", "PX", dureeMs, "NX")) === "OK";
  }
}
