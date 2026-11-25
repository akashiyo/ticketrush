import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type pg from "pg";

import { creerVerificateurKeycloak, VERIFICATEUR_JETON } from "./authentification.js";
import { BASE, creerBase, creerPool, POOL } from "./base-de-donnees.js";
import { CONFIG, type Config, lireConfig } from "./config.js";
import { SanteController } from "./sante.controller.js";

/** Infrastructure commune à tous les modules du Cœur : configuration, base, jetons, santé. */
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
      provide: VERIFICATEUR_JETON,
      useFactory: (config: Config) => creerVerificateurKeycloak(config),
      inject: [CONFIG],
    },
  ],
  exports: [CONFIG, POOL, BASE, VERIFICATEUR_JETON],
})
export class CommunModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
