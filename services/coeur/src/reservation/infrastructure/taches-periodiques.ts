import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { BASE } from "../../commun/base-de-donnees.js";
import { CONFIG, type Config } from "../../commun/config.js";
import { ProducteurKafka } from "../../commun/evenements/producteur-kafka.js";
import { RelaisOutbox } from "../../commun/evenements/relais-outbox.js";
import { repeterEnFond, TAILLE_LOT } from "../../commun/taches-de-fond.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { outbox } from "./schema.js";

/**
 * Les deux tâches de fond du module Réservation, démarrées après les migrations :
 * - le relais de son Outbox vers Redpanda (ADR 007), toutes les 200 ms par défaut ;
 * - la libération des blocages expirés (ADR 003), toutes les 5 s par défaut.
 * La vente ne dépend d'aucune des deux : une erreur est journalisée et la tâche réessaie.
 */
@Injectable()
export class TachesPeriodiques implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("Reservation");
  private arrets: (() => void)[] = [];

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(BASE) private readonly db: NodePgDatabase,
    private readonly depot: DepotSiegesPostgres,
    private readonly producteur: ProducteurKafka,
  ) {}

  onApplicationBootstrap(): void {
    const relais = new RelaisOutbox(this.db, outbox, this.producteur);
    this.arrets = [
      repeterEnFond(
        "relais de l'Outbox (reservation)",
        this.config.relaisIntervalleMs,
        () => relais.publierUnLot(),
        this.journal,
      ),
      repeterEnFond(
        "expiration des blocages",
        this.config.expirationIntervalleMs,
        () => this.depot.libererExpires(TAILLE_LOT),
        this.journal,
      ),
    ];
  }

  onApplicationShutdown(): void {
    this.arrets.forEach((arreter) => arreter());
  }
}
