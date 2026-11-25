import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { categorie, siege } from "../reservation/infrastructure/schema.js";

export const ORGANISATION_TEST = "6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e01";

/** Crée une vente de test : une catégorie à 65 € et ses places, numérotées ou en placement libre. */
export async function creerVenteDeTest(
  db: NodePgDatabase,
  options: { places: number; numerotees?: boolean },
): Promise<{ evenementId: string; categorieId: string; sieges: string[] }> {
  const evenementId = randomUUID();
  const categorieId = randomUUID();
  const sieges = Array.from({ length: options.places }, () => randomUUID());
  await db.insert(categorie).values({ id: categorieId, evenementId, prixCentimes: 6500 });
  await db.insert(siege).values(
    sieges.map((id, i) => ({
      id,
      evenementId,
      organisationId: ORGANISATION_TEST,
      categorieId,
      numero: (options.numerotees ?? true) ? `A-${i + 1}` : null,
    })),
  );
  return { evenementId, categorieId, sieges };
}
