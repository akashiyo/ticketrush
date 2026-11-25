import { Logger } from "@nestjs/common";
import { type Consumer, Kafka, logLevel } from "kafkajs";

export interface MessageRecu {
  topic: string;
  cle: string | null;
  valeur: string;
}

/**
 * Consommateur KafkaJS d'un groupe (ADR 006) : lit les topics depuis le début de leur rétention,
 * un message à la fois par partition, dans l'ordre.
 *
 * - Le traitement doit être **idempotent** : le relais de l'Outbox livre au moins une fois.
 * - Un traitement en erreur n'est pas validé : KafkaJS le relance, sans sauter de message.
 * - Broker injoignable au démarrage : on réessaie toutes les 5 s, sans empêcher le Cœur de démarrer
 *   ni la vente de continuer (scénario D-2).
 */
export class ConsommateurKafka {
  private readonly consommateur: Consumer;
  private readonly journal: Logger;
  private arret = false;
  private reessai: NodeJS.Timeout | null = null;

  constructor(
    brokers: string[],
    groupe: string,
    private readonly topics: string[],
    private readonly traiter: (message: MessageRecu) => Promise<void>,
  ) {
    this.journal = new Logger(`Consommateur ${groupe}`);
    this.consommateur = new Kafka({
      clientId: "ticketrush-coeur",
      brokers,
      logLevel: logLevel.WARN,
    }).consumer({ groupId: groupe, allowAutoTopicCreation: true });
  }

  demarrer(): void {
    void this.tenter();
  }

  async arreter(): Promise<void> {
    this.arret = true;
    if (this.reessai) clearTimeout(this.reessai);
    await this.consommateur.disconnect();
  }

  private async tenter(): Promise<void> {
    try {
      await this.consommateur.connect();
      await this.consommateur.subscribe({ topics: this.topics, fromBeginning: true });
      await this.consommateur.run({
        eachMessage: async ({ topic, message }) => {
          await this.traiter({
            topic,
            cle: message.key?.toString() ?? null,
            valeur: message.value?.toString() ?? "",
          });
        },
      });
    } catch (erreur) {
      this.journal.warn(`broker injoignable, nouvel essai dans 5 s : ${(erreur as Error).message}`);
      await this.consommateur.disconnect().catch(() => undefined);
      if (!this.arret) this.reessai = setTimeout(() => void this.tenter(), 5_000);
    }
  }
}
