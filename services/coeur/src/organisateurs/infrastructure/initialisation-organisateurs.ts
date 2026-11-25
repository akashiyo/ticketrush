import { fileURLToPath } from "node:url";

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { BASE } from "../../commun/base-de-donnees.js";
import { CONFIG, type Config } from "../../commun/config.js";
import { ProducteurKafka } from "../../commun/evenements/producteur-kafka.js";
import { RelaisOutbox } from "../../commun/evenements/relais-outbox.js";
import { repeterEnFond } from "../../commun/taches-de-fond.js";
import { chargerOrganisateursDemo } from "./donnees-demo.js";
import { outbox } from "./schema.js";

/** Applique les migrations du schéma `organisateurs`, avec son propre journal (ADR 002). */
export async function migrerOrganisateurs(db: NodePgDatabase): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    migrationsTable: "migrations_organisateurs",
  });
}

/**
 * Au démarrage : migrations (dont la Row-Level Security), données de démonstration si demandé
 * (ADR 022, M-2). Ensuite, le relais de l'Outbox des Organisateurs vers Redpanda (ADR 007).
 */
@Injectable()
export class InitialisationOrganisateurs
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly journal = new Logger("Organisateurs");
  private arreterRelais: () => void = () => undefined;

  constructor(
    @Inject(BASE) private readonly db: NodePgDatabase,
    @Inject(CONFIG) private readonly config: Config,
    private readonly producteur: ProducteurKafka,
  ) {}

  async onModuleInit(): Promise<void> {
    await migrerOrganisateurs(this.db);
    if (this.config.donneesDemo && (await chargerOrganisateursDemo(this.db))) {
      this.journal.log("Événements de démonstration publiés");
    }
  }

  onApplicationBootstrap(): void {
    const relais = new RelaisOutbox(this.db, outbox, this.producteur);
    this.arreterRelais = repeterEnFond(
      "relais de l'Outbox (organisateurs)",
      this.config.relaisIntervalleMs,
      () => relais.publierUnLot(),
      this.journal,
    );
  }

  onApplicationShutdown(): void {
    this.arreterRelais();
  }
}
