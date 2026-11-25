import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { VENTE_DEMO } from "../../commun/vente-demo.js";
import { categorie, siege } from "./schema.js";

/**
 * Places de la vente de démonstration du squelette : 5 000 places, comme le test de charge (C-1).
 * Remplacées plus tard par les places générées à la publication d'un événement par le Catalogue.
 */
export { VENTE_DEMO };

/** Crée la vente de démonstration si elle n'existe pas encore (sans effet au redémarrage). */
export async function chargerVenteDemo(db: NodePgDatabase): Promise<boolean> {
  const { evenementId, organisationId, fosse, categorie1 } = VENTE_DEMO;
  const deja = await db
    .select({ id: categorie.id })
    .from(categorie)
    .where(eq(categorie.evenementId, evenementId))
    .limit(1);
  if (deja.length > 0) return false;

  const places = [
    ...Array.from({ length: fosse.places }, () => ({
      categorieId: fosse.id,
      numero: null as string | null,
    })),
    ...Array.from({ length: categorie1.rangs * categorie1.parRang }, (_, i) => ({
      categorieId: categorie1.id,
      numero: `${String.fromCharCode(65 + Math.floor(i / categorie1.parRang))}-${(i % categorie1.parRang) + 1}`,
    })),
  ];

  await db.transaction(async (tx) => {
    await tx.insert(categorie).values([
      {
        id: fosse.id,
        evenementId,
        libelle: "Fosse",
        placement: "libre",
        prixCentimes: fosse.prixCentimes,
      },
      {
        id: categorie1.id,
        evenementId,
        libelle: "Catégorie 1",
        placement: "numerote",
        prixCentimes: categorie1.prixCentimes,
      },
    ]);
    for (let i = 0; i < places.length; i += 1_000) {
      await tx
        .insert(siege)
        .values(
          places
            .slice(i, i + 1_000)
            .map((p) => ({ id: randomUUID(), evenementId, organisationId, ...p })),
        );
    }
  });
  return true;
}
