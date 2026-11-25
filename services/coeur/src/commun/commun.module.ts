import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import type pg from "pg";

import { creerVerificateurKeycloak, VERIFICATEUR_JETON } from "./authentification.js";
import { BASE, creerBase, creerPool, POOL } from "./base-de-donnees.js";
import { CONFIG, type Config, lireConfig } from "./config.js";
import { ProducteurKafka } from "./evenements/producteur-kafka.js";
import { SanteController } from "./sante.controller.js";

export const REDIS = Symbol("Redis");

/**
 * Infrastructure commune à tous les modules du Cœur : configuration, base, Redis, producteur
 * d'événements (un seul pour tous les relais d'Outbox), jetons Keycloak, santé.
 */
@Global()
@Module({
  controllers: [SanteController],
  providers: [
    { provide: CONFIG, useFactory: () => lireConfig() },
    {
      provide: POOL,
      useFactory: (config: Config) => creerPool(config.databaseUrl),
      inject: [CONFIG],
    },
    { provide: BASE, useFactory: (pool: pg.Pool) => creerBase(pool), inject: [POOL] },
    {
      provide: REDIS,
      // Connexion paresseuse et peu de nouvelles tentatives : Redis en panne ne bloque ni le
      // démarrage ni les requêtes, le cache se contourne (ADR 015).
      useFactory: (config: Config) =>
        new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }),
      inject: [CONFIG],
    },
    {
      provide: ProducteurKafka,
      useFactory: (config: Config) => new ProducteurKafka(config.kafkaBrokers),
      inject: [CONFIG],
    },
    {
      provide: VERIFICATEUR_JETON,
      useFactory: (config: Config) => creerVerificateurKeycloak(config),
      inject: [CONFIG],
    },
  ],
  exports: [CONFIG, POOL, BASE, REDIS, ProducteurKafka, VERIFICATEUR_JETON],
})
export class CommunModule implements OnApplicationShutdown {
  constructor(
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly producteur: ProducteurKafka,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.producteur.fermer();
    this.redis.disconnect();
    await this.pool.end();
  }
}
