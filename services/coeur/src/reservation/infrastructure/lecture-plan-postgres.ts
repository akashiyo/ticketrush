import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { LecturePlan } from "../domaine/ports.js";
import type { PlanDeSalle } from "../domaine/plan.js";
import { categorie, siege } from "./schema.js";

const estDisponible = sql<boolean>`(${siege.statut} = 'libre' OR (${siege.statut} = 'bloque' AND ${siege.bloqueJusqua} < now()))`;

/** Lecture du plan de salle dans PostgreSQL : deux requêtes, sans verrou. */
export class LecturePlanPostgres implements LecturePlan {
  constructor(private readonly db: NodePgDatabase) {}

  async lire(evenementId: string): Promise<PlanDeSalle | null> {
    const categories = await this.db
      .select({
        categorieId: categorie.id,
        libelle: categorie.libelle,
        placement: categorie.placement,
        prixCentimes: categorie.prixCentimes,
        disponibles: sql<number>`count(*) FILTER (WHERE ${estDisponible})::int`,
      })
      .from(categorie)
      .innerJoin(siege, eq(siege.categorieId, categorie.id))
      .where(eq(categorie.evenementId, evenementId))
      .groupBy(categorie.id)
      .orderBy(asc(categorie.prixCentimes));
    if (categories.length === 0) return null;

    const sieges = await this.db
      .select({
        categorieId: siege.categorieId,
        siegeId: siege.id,
        numero: siege.numero,
        disponible: estDisponible,
      })
      .from(siege)
      .innerJoin(categorie, eq(categorie.id, siege.categorieId))
      .where(and(eq(siege.evenementId, evenementId), eq(categorie.placement, "numerote")))
      .orderBy(asc(siege.numero));

    return {
      evenementId,
      categories: categories.map((c) => ({
        ...c,
        places: sieges
          .filter((s) => s.categorieId === c.categorieId)
          .map((s) => ({ siegeId: s.siegeId, numero: s.numero ?? "", disponible: s.disponible })),
      })),
    };
  }
}
