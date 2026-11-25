import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { categorie, siege } from "./schema.js";

/**
 * Vente de démonstration du squelette : 5 000 places, comme le test de charge (C-1).
 * Remplacée plus tard par les places générées à la publication d'un événement par le Catalogue.
 * Identifiants fixes, pour que la File d'attente, le navigateur et k6 visent la même vente.
 */
export const VENTE_DEMO = {
  evenementId: "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50",
  /** Alpha Productions, organisation de test du domaine Keycloak (infra/keycloak). */
  organisationId: "6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e01",
  fosse: { id: "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e51", places: 3_000, prixCentimes: 4_500 },
  /** Places numérotées : rangs A à T, 100 sièges par rang. */
  categorie1: {
    id: "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e52",
    rangs: 20,
    parRang: 100,
    prixCentimes: 6_500,
  },
} as const;

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
