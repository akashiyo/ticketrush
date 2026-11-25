import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { CONFIG, type Config } from "../../commun/config.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { ProducteurKafka } from "./outbox/producteur-kafka.js";
import { RelaisOutbox } from "./outbox/relais-outbox.js";

/** Taille d'un lot de places expirées ou d'événements à publier. */
const TAILLE_LOT = 500;

/**
 * Les deux tâches de fond du module Réservation, démarrées après les migrations :
 * - le relais de l'Outbox vers Redpanda (ADR 007), toutes les 200 ms par défaut ;
 * - la libération des blocages expirés (ADR 003), toutes les 5 s par défaut.
 *
 * Une boucle qui tombe sur une erreur (broker ou base indisponible) la journalise et réessaie au
 * tour suivant : la vente n'en dépend pas. Un intervalle à 0 désactive la tâche (tests).
 */
@Injectable()
export class TachesPeriodiques implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("Reservation");
  /** Une minuterie en cours par tâche. */
  private readonly minuteries = new Map<string, NodeJS.Timeout>();
  private arret = false;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly depot: DepotSiegesPostgres,
    private readonly relais: RelaisOutbox,
    private readonly producteur: ProducteurKafka,
  ) {}

  onApplicationBootstrap(): void {
    this.repeter("relais de l'Outbox", this.config.relaisIntervalleMs, () =>
      this.relais.publierUnLot(),
    );
    this.repeter("expiration des blocages", this.config.expirationIntervalleMs, () =>
      this.depot.libererExpires(TAILLE_LOT),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.arret = true;
    this.minuteries.forEach((minuterie) => clearTimeout(minuterie));
    await this.producteur.fermer();
  }

  /** Lance `tache` en boucle ; un lot plein relance aussitôt la tâche pour vider le retard. */
  private repeter(nom: string, intervalleMs: number, tache: () => Promise<number>): void {
    if (intervalleMs <= 0) return;
    const tour = async (): Promise<void> => {
      let delai = intervalleMs;
      try {
        if ((await tache()) >= TAILLE_LOT) delai = 0;
      } catch (erreur) {
        this.journal.warn(`${nom} : ${(erreur as Error).message}`);
      }
      if (!this.arret)
        this.minuteries.set(
          nom,
          setTimeout(() => void tour(), delai),
        );
    };
    this.minuteries.set(
      nom,
      setTimeout(() => void tour(), intervalleMs),
    );
  }
}
