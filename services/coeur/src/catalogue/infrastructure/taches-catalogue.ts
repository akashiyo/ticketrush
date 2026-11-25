import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { TOPIC_CATALOGUE } from "@ticketrush/contrats";

import { CONFIG, type Config } from "../../commun/config.js";
import { ConsommateurKafka } from "../../commun/evenements/consommateur-kafka.js";
import { ProjeterEvenement } from "../application/projeter-evenement.js";
import { LectureFicheEnCache } from "./lecture-fiche-en-cache.js";
import { evenementDuFait, traduireMessage } from "./projection.js";

/** Groupe de consommateurs de la projection : les instances du Cœur se partagent les partitions. */
export const GROUPE_PROJECTION = "coeur-projection-catalogue";

/**
 * La projection du Catalogue (ADR 014, 015) : consommer `catalogue.evenements`, mettre à jour
 * l'index de recherche et les fiches, puis invalider la fiche en cache.
 */
@Injectable()
export class TachesCatalogue implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("Catalogue");
  private consommateur: ConsommateurKafka | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly projeter: ProjeterEvenement,
    private readonly fiches: LectureFicheEnCache,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.consommateursActifs) return;
    this.consommateur = new ConsommateurKafka(
      this.config.kafkaBrokers,
      GROUPE_PROJECTION,
      [TOPIC_CATALOGUE],
      async ({ valeur }) => {
        const fait = traduireMessage(valeur);
        if (!fait) return;
        await this.projeter.executer(fait);
        // Toujours invalider : même une publication remplace une fiche « inconnue » en cache.
        await this.fiches.invalider(evenementDuFait(fait));
        this.journal.debug(`projeté : ${evenementDuFait(fait)}`);
      },
    );
    this.consommateur.demarrer();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consommateur?.arreter();
  }
}
