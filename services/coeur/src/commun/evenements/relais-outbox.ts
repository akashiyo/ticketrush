import { inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { TableOutbox } from "./outbox.js";

export interface MessageAPublier {
  topic: string;
  cle: string;
  valeur: string;
  entetes: Record<string, string>;
}

/** Ce dont le relais a besoin pour publier : implémenté avec KafkaJS vers Redpanda (ADR 006). */
export interface ProducteurEvenements {
  envoyer(messages: MessageAPublier[]): Promise<void>;
}

/**
 * Relais de l'Outbox d'un module (ADR 007) : lit un lot d'événements non publiés, les envoie au
 * broker, puis les marque publiés, dans une transaction.
 *
 * - Livraison **au moins une fois** : si le Cœur tombe après l'envoi mais avant le COMMIT, le
 *   lot sera renvoyé. Les consommateurs ignorent les doublons grâce à l'`id` de l'enveloppe.
 * - Broker indisponible : l'envoi échoue, la transaction est annulée, les événements restent dans
 *   l'Outbox et partent au retour du broker. La vente continue (dette D-004, scénario D-2).
 * - SKIP LOCKED : plusieurs instances du Cœur ne publient jamais le même lot en même temps.
 */
export class RelaisOutbox {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: TableOutbox,
    private readonly producteur: ProducteurEvenements,
    private readonly taille = 500,
  ) {}

  /** Publie un lot ; renvoie le nombre d'événements publiés. */
  async publierUnLot(): Promise<number> {
    const outbox = this.outbox;
    return this.db.transaction(async (tx) => {
      const lot = await tx
        .select()
        .from(outbox)
        .where(isNull(outbox.publieLe))
        .orderBy(outbox.ordre)
        .limit(this.taille)
        .for("update", { skipLocked: true });
      if (lot.length === 0) return 0;

      await this.producteur.envoyer(
        lot.map((ligne): MessageAPublier => ({
          topic: ligne.topic,
          cle: ligne.cle,
          valeur: JSON.stringify(ligne.contenu),
          entetes: ligne.traceparent ? { traceparent: ligne.traceparent } : {},
        })),
      );
      await tx
        .update(outbox)
        .set({ publieLe: sql`now()` })
        .where(
          inArray(
            outbox.id,
            lot.map((ligne) => ligne.id),
          ),
        );
      return lot.length;
    });
  }
}
