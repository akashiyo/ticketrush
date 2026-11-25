import { inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { StatistiquesVentes, VentesEvenement } from "../domaine/ports.js";
import { billet, siege } from "./schema.js";

/**
 * Ventes par événement : deux agrégats, sans verrou. Lu par le back-office, hors du chemin de la
 * vente ; l'organisateur ne demande que ses propres événements (module Organisateurs, S-3).
 */
export class StatistiquesVentesPostgres implements StatistiquesVentes {
  constructor(private readonly db: NodePgDatabase) {}

  async parEvenement(evenementIds: string[]): Promise<Map<string, VentesEvenement>> {
    if (evenementIds.length === 0) return new Map();
    const places = await this.db
      .select({
        evenementId: siege.evenementId,
        places: sql<number>`count(*)::int`,
        vendues: sql<number>`(count(*) FILTER (WHERE ${siege.statut} = 'vendu'))::int`,
        bloquees: sql<number>`(count(*) FILTER (WHERE ${siege.statut} = 'bloque' AND ${siege.bloqueJusqua} > now()))::int`,
      })
      .from(siege)
      .where(inArray(siege.evenementId, evenementIds))
      .groupBy(siege.evenementId);
    const recettes = await this.db
      .select({
        evenementId: billet.evenementId,
        recetteCentimes: sql<number>`coalesce(sum(${billet.prixCentimes}), 0)::int`,
      })
      .from(billet)
      .where(inArray(billet.evenementId, evenementIds))
      .groupBy(billet.evenementId);
    return new Map(
      places.map((p) => [
        p.evenementId,
        {
          places: p.places,
          vendues: p.vendues,
          bloquees: p.bloquees,
          recetteCentimes:
            recettes.find((r) => r.evenementId === p.evenementId)?.recetteCentimes ?? 0,
        },
      ]),
    );
  }
}
