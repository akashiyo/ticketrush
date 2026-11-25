import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type pg from "pg";

import { POOL } from "./base-de-donnees.js";

/** Contrôle de santé du Compose : le Cœur n'est sain que si PostgreSQL répond. */
@Controller("sante")
export class SanteController {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  @Get()
  async sante(): Promise<{ statut: "ok" }> {
    try {
      await this.pool.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException("PostgreSQL indisponible");
    }
    return { statut: "ok" };
  }
}
