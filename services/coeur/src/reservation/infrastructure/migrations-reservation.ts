import { fileURLToPath } from "node:url";

import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { BASE } from "../../commun/base-de-donnees.js";
import { CONFIG, type Config } from "../../commun/config.js";
import { chargerVenteDemo, VENTE_DEMO } from "./donnees-demo.js";

/** Applique les migrations du schéma `reservation`. Chaque module tient son propre journal (ADR 002). */
export async function migrerReservation(db: NodePgDatabase): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    migrationsTable: "migrations_reservation",
  });
}

/**
 * Au démarrage du Cœur, la base est mise à jour avant d'accepter des requêtes, puis la vente de
 * démonstration est chargée si demandé : la plateforme démarre en une commande (ADR 022, M-2).
 */
@Injectable()
export class InitialisationReservation implements OnModuleInit {
  constructor(
    @Inject(BASE) private readonly db: NodePgDatabase,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async onModuleInit(): Promise<void> {
    await migrerReservation(this.db);
    if (this.config.donneesDemo && (await chargerVenteDemo(this.db))) {
      new Logger("Reservation").log(`Vente de démonstration créée : ${VENTE_DEMO.evenementId}`);
    }
  }
}
