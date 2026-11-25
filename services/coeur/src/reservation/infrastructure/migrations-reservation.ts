import { fileURLToPath } from "node:url";

import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { BASE } from "../../commun/base-de-donnees.js";

/** Applique les migrations du schéma `reservation`. Chaque module tient son propre journal (ADR 002). */
export async function migrerReservation(db: NodePgDatabase): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    migrationsTable: "migrations_reservation",
  });
}

/** Au démarrage du Cœur, la base est mise à jour avant d'accepter des requêtes (ADR 022, M-2). */
@Injectable()
export class MigrationsReservation implements OnModuleInit {
  constructor(@Inject(BASE) private readonly db: NodePgDatabase) {}

  async onModuleInit(): Promise<void> {
    await migrerReservation(this.db);
  }
}
