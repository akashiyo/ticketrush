import { Logger } from "@nestjs/common";

import type { FicheEvenement } from "../domaine/evenement.js";
import type { LectureFiche } from "../domaine/ports.js";

/** Ce dont le cache a besoin : implémenté avec Redis (cache-redis.ts). */
export interface Cache {
  lire(cle: string): Promise<string | null>;
  ecrire(cle: string, valeur: string, dureeSec: number): Promise<void>;
  /** Pose un verrou de courte durée ; true si on l'a obtenu. */
  prendreVerrou(cle: string, dureeMs: number): Promise<boolean>;
  supprimer(cle: string): Promise<void>;
}

export interface OptionsCacheFiches {
  /** Durée de vie : 10 minutes, avec ± 10 % d'aléatoire (ADR 015). */
  dureeSec?: number;
  aleatoire?: () => number;
  attendre?: (ms: number) => Promise<void>;
}

const cle = (evenementId: string) => `catalogue:fiche:${evenementId}`;
const ABSENTE = "null";
/** Une fiche inconnue est retenue peu de temps : pas d'aller-retour en base à chaque demande. */
const DUREE_ABSENTE_SEC = 30;
const ATTENTE_MS = 25;
const ESSAIS = 40;

/**
 * Cache-aside des fiches d'événement (ADR 015, scénario P-3), en décorateur de la lecture
 * PostgreSQL : même interface, le code appelant ne voit aucune différence.
 *
 * - Lecture dans Redis d'abord ; en cas d'absence, lecture en base puis écriture dans Redis.
 * - **Contre l'avalanche** : quand la fiche du concert en vente expire, une seule requête la
 *   recharge, grâce à un verrou Redis ; les autres attendent quelques millisecondes et relisent.
 * - Durée de vie de 10 min ± 10 % : les clés n'expirent pas toutes en même temps.
 * - **Invalidation** immédiate à la réception d'EvenementModifie ou TarifModifie (projection).
 * - Redis en panne : on lit directement la base (dégradation gracieuse), sans erreur pour l'acheteur.
 */
export class LectureFicheEnCache implements LectureFiche {
  private readonly journal = new Logger("CacheFiches");
  private readonly dureeSec: number;
  private readonly aleatoire: () => number;
  private readonly attendre: (ms: number) => Promise<void>;

  constructor(
    private readonly interne: LectureFiche,
    private readonly cache: Cache,
    options: OptionsCacheFiches = {},
  ) {
    this.dureeSec = options.dureeSec ?? 600;
    this.aleatoire = options.aleatoire ?? Math.random;
    this.attendre = options.attendre ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async lire(evenementId: string): Promise<FicheEvenement | null> {
    try {
      for (let essai = 0; essai < ESSAIS; essai++) {
        const enCache = await this.cache.lire(cle(evenementId));
        if (enCache !== null)
          return enCache === ABSENTE ? null : (JSON.parse(enCache) as FicheEvenement);

        if (await this.cache.prendreVerrou(`${cle(evenementId)}:verrou`, 2_000)) {
          try {
            return await this.recharger(evenementId);
          } finally {
            await this.cache.supprimer(`${cle(evenementId)}:verrou`);
          }
        }
        await this.attendre(ATTENTE_MS);
      }
    } catch (erreur) {
      this.journal.warn(`Redis indisponible, lecture directe : ${(erreur as Error).message}`);
    }
    return this.interne.lire(evenementId);
  }

  async invalider(evenementId: string): Promise<void> {
    await this.cache.supprimer(cle(evenementId));
  }

  private async recharger(evenementId: string): Promise<FicheEvenement | null> {
    const fiche = await this.interne.lire(evenementId);
    const duree = fiche
      ? Math.round(this.dureeSec * (0.9 + 0.2 * this.aleatoire()))
      : DUREE_ABSENTE_SEC;
    await this.cache.ecrire(cle(evenementId), fiche ? JSON.stringify(fiche) : ABSENTE, duree);
    return fiche;
  }
}
