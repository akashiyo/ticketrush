import { Kafka, logLevel, Partitioners, type Producer } from "kafkajs";

import type { MessageAPublier, ProducteurEvenements } from "./relais-outbox.js";

/** Producteur KafkaJS vers Redpanda (ADR 006). La connexion est ouverte au premier envoi. */
export class ProducteurKafka implements ProducteurEvenements {
  private readonly producteur: Producer;
  private connecte: Promise<void> | null = null;

  constructor(brokers: string[]) {
    this.producteur = new Kafka({
      clientId: "ticketrush-coeur",
      brokers,
      logLevel: logLevel.WARN,
      // Pas de longue attente : le relais réessaie lui-même toutes les 200 ms.
      retry: { retries: 2 },
    }).producer({
      allowAutoTopicCreation: true,
      // Partition choisie par hachage de la clé (l'événement) : une vente reste sur une partition.
      createPartitioner: Partitioners.DefaultPartitioner,
    });
  }

  async envoyer(messages: MessageAPublier[]): Promise<void> {
    this.connecte ??= this.producteur.connect().catch((erreur: unknown) => {
      this.connecte = null; // nouvel essai de connexion au prochain lot
      throw erreur;
    });
    await this.connecte;

    const parTopic = new Map<string, MessageAPublier[]>();
    for (const message of messages) {
      parTopic.set(message.topic, [...(parTopic.get(message.topic) ?? []), message]);
    }
    await this.producteur.sendBatch({
      // Le broker confirme seulement quand toutes les répliques ont écrit (acks = -1).
      acks: -1,
      topicMessages: [...parTopic].map(([topic, liste]) => ({
        topic,
        messages: liste.map((m) => ({ key: m.cle, value: m.valeur, headers: m.entetes })),
      })),
    });
  }

  async fermer(): Promise<void> {
    if (this.connecte) await this.producteur.disconnect();
  }
}
