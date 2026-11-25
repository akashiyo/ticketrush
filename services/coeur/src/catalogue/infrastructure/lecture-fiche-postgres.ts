import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { FicheEvenement } from "../domaine/evenement.js";
import type { LectureFiche } from "../domaine/ports.js";
import { categorie, evenement, salle } from "./schema.js";

/** Fiche d'un événement publié, lue dans le schéma du Catalogue. */
export class LectureFichePostgres implements LectureFiche {
  constructor(private readonly db: NodePgDatabase) {}

  async lire(evenementId: string): Promise<FicheEvenement | null> {
    const [ligne] = await this.db
      .select({ evenement, salle })
      .from(evenement)
      .innerJoin(salle, eq(salle.id, evenement.salleId))
      .where(and(eq(evenement.id, evenementId), eq(evenement.statut, "publie")));
    if (!ligne) return null;
    const categories = await this.db
      .select()
      .from(categorie)
      .where(eq(categorie.evenementId, evenementId))
      .orderBy(asc(categorie.prixCentimes));
    const e = ligne.evenement;
    return {
      evenementId: e.id,
      titre: e.titre,
      artiste: e.artiste,
      genre: e.genre,
      salle: { nom: ligne.salle.nom, ville: ligne.salle.ville },
      debutLe: e.debutLe.toISOString(),
      categories: categories.map((c) => ({
        categorieId: c.id,
        libelle: c.libelle,
        placement: c.placement,
        prixCentimes: c.prixCentimes,
        capacite: c.capacite,
      })),
    };
  }
}
