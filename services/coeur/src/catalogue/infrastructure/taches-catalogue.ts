import { TOPIC_CATALOGUE } from "@ticketrush/contrats";
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
import { ConsommateurKafka } from "../../commun/evenements/consommateur-kafka.js";
import { ProducteurKafka } from "../../commun/evenements/producteur-kafka.js";
import { RelaisOutbox } from "../../commun/evenements/relais-outbox.js";
import { repeterEnFond } from "../../commun/taches-de-fond.js";
import { ProjeterEvenement } from "../application/projeter-evenement.js";
import { LectureFicheEnCache } from "./lecture-fiche-en-cache.js";
import { traduireMessage } from "./projection.js";
import { outbox } from "./schema.js";

/** Groupe de consommateurs de la projection : chaque instance du Cœur se partage les partitions. */
export const GROUPE_PROJECTION = "coeur-projection-catalogue";

/**
 * Tâches de fond du Catalogue :
 * - le relais de son Outbox vers Redpanda (ADR 007) ;
 * - la projection : consommer `catalogue.evenements`, indexer dans Meilisearch, invalider le cache
 *   des fiches (ADR 014, 015).
 */
@Injectable()
export class TachesCatalogue implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("Catalogue");
  private arreterRelais: () => void = () => undefined;
  private consommateur: ConsommateurKafka | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(BASE) private readonly db: NodePgDatabase,
    private readonly producteur: ProducteurKafka,
    private readonly projeter: ProjeterEvenement,
    private readonly fiches: LectureFicheEnCache,
  ) {}

  onApplicationBootstrap(): void {
    const relais = new RelaisOutbox(this.db, outbox, this.producteur);
    this.arreterRelais = repeterEnFond(
      "relais de l'Outbox (catalogue)",
      this.config.relaisIntervalleMs,
      () => relais.publierUnLot(),
      this.journal,
    );
    if (this.config.relaisIntervalleMs <= 0) return; // tests : pas de broker
    this.consommateur = new ConsommateurKafka(
      this.config.kafkaBrokers,
      GROUPE_PROJECTION,
      [TOPIC_CATALOGUE],
      async ({ valeur }) => {
        const traduit = traduireMessage(valeur);
        if (!traduit) return;
        const resultat = await this.projeter.executer(traduit.fait);
        if (traduit.invaliderFiche)
          await this.fiches.invalider(
            traduit.fait.type === "etat" ? traduit.fait.document.id : traduit.fait.evenementId,
          );
        this.journal.debug(`projection : ${resultat}`);
      },
    );
    this.consommateur.demarrer();
  }

  async onApplicationShutdown(): Promise<void> {
    this.arreterRelais();
    await this.consommateur?.arreter();
  }
}
