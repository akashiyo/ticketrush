import { TOPIC_VENTES } from "@ticketrush/contrats";

import type { outbox } from "../schema.js";

/** Une ligne d'Outbox à partir d'un événement au format du contrat (ADR 007). */
export function versOutbox(evenement: {
  id: string;
  type: string;
  evenementId: string;
}): typeof outbox.$inferInsert {
  return {
    id: evenement.id,
    topic: TOPIC_VENTES,
    // Clé de partition : tous les messages d'une même vente arrivent dans l'ordre (ADR 006).
    cle: evenement.evenementId,
    type: evenement.type,
    contenu: evenement,
  };
}
