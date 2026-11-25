import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { FicheEvenement, VueEvenement } from "../domaine/evenement.js";
import type { LectureFiche, MagasinVues } from "../domaine/ports.js";
import { fiche } from "./schema.js";

/**
 * Les fiches dans PostgreSQL : un magasin de la projection, et la source du cache des fiches.
 * L'écriture ne remplace une fiche que par une version plus récente, dans le même ordre SQL :
 * deux projections concurrentes ne peuvent pas faire reculer une fiche.
 */
export class FichesPostgres implements MagasinVues, LectureFiche {
  constructor(private readonly db: NodePgDatabase) {}

  lireLigne(evenementId: string) {
    return this.db.select().from(fiche).where(eq(fiche.evenementId, evenementId));
  }

  async lire(evenementId: string): Promise<VueEvenement | null> {
    const [ligne] = await this.lireLigne(evenementId);
    return ligne ? { ...ligne.contenu, version: ligne.version } : null;
  }

  async ecrire({ version, ...contenu }: VueEvenement): Promise<void> {
    await this.db
      .insert(fiche)
      .values({ evenementId: contenu.evenementId, version, contenu })
      .onConflictDoUpdate({
        target: fiche.evenementId,
        set: { version, contenu },
        setWhere: sql`${fiche.version} < ${version}`,
      });
  }
}

/** La lecture de la fiche affichée, sans sa version technique. */
export class LectureFichePostgres implements LectureFiche {
  constructor(private readonly fiches: FichesPostgres) {}

  async lire(evenementId: string): Promise<FicheEvenement | null> {
    const [ligne] = await this.fiches.lireLigne(evenementId);
    return ligne?.contenu ?? null;
  }
}
