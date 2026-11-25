/**
 * La table Outbox (ADR 007), une par schéma de module : chaque module écrit ses événements dans
 * son propre schéma, dans la même transaction que l'effet métier (ADR 002).
 */
import { sql } from "drizzle-orm";
import { bigserial, index, jsonb, type PgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export function tableOutbox(schema: PgSchema) {
  return schema.table(
    "outbox",
    {
      id: uuid("id").primaryKey(),
      /** Ordre d'écriture : le relais publie dans cet ordre (deux événements d'une même transaction). */
      ordre: bigserial("ordre", { mode: "number" }).notNull(),
      topic: text("topic").notNull(),
      /** Clé de partition : l'identifiant de l'événement (le spectacle). */
      cle: text("cle").notNull(),
      type: text("type").notNull(),
      /** L'enveloppe complète, au format du contrat (packages/contrats). */
      contenu: jsonb("contenu").notNull(),
      /** Contexte de trace OpenTelemetry (ADR 017). */
      traceparent: text("traceparent"),
      creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
      publieLe: timestamp("publie_le", { withTimezone: true }),
    },
    (t) => [
      index("outbox_a_publier_idx")
        .on(t.ordre)
        .where(sql`publie_le IS NULL`),
    ],
  );
}

export type TableOutbox = ReturnType<typeof tableOutbox>;

/** Une ligne d'Outbox à partir d'un événement au format du contrat (ADR 007). */
export function versOutbox(
  topic: string,
  evenement: { id: string; type: string; evenementId: string },
): TableOutbox["$inferInsert"] {
  return {
    id: evenement.id,
    topic,
    // Clé de partition : tous les messages d'une même vente arrivent dans l'ordre (ADR 006).
    cle: evenement.evenementId,
    type: evenement.type,
    contenu: evenement,
  };
}
