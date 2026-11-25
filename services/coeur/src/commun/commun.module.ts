import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type pg from "pg";

import { BASE, creerBase, creerPool, POOL } from "./base-de-donnees.js";
import { CONFIG, type Config, lireConfig } from "./config.js";
import { SanteController } from "./sante.controller.js";

/** Infrastructure commune à tous les modules du Cœur : configuration, base, santé. */
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
  ],
  exports: [CONFIG, POOL, BASE],
})
export class CommunModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
