import { fileURLToPath } from "node:url";

import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { BASE } from "../../commun/base-de-donnees.js";
import { CONFIG, type Config } from "../../commun/config.js";
import { chargerCatalogueDemo } from "./donnees-demo.js";

/** Applique les migrations du schéma `catalogue`, avec son propre journal (ADR 002). */
export async function migrerCatalogue(db: NodePgDatabase): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    migrationsTable: "migrations_catalogue",
  });
}

/** Au démarrage : migrations, puis catalogue de démonstration si demandé (ADR 022, M-2). */
@Injectable()
export class InitialisationCatalogue implements OnModuleInit {
  constructor(
    @Inject(BASE) private readonly db: NodePgDatabase,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async onModuleInit(): Promise<void> {
    await migrerCatalogue(this.db);
    if (this.config.donneesDemo && (await chargerCatalogueDemo(this.db))) {
      new Logger("Catalogue").log("Catalogue de démonstration publié");
    }
  }
}
