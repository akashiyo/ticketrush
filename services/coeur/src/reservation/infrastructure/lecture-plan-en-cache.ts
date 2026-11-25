import type { LecturePlan } from "../domaine/ports.js";
import type { PlanDeSalle } from "../domaine/plan.js";

/**
 * Décorateur (cours, partie 4) : même interface que la lecture qu'il enveloppe, avec un cache en
 * mémoire de courte durée.
 *
 * Au pic, des milliers d'acheteurs admis affichent le même plan. Sans cache, chacun lancerait deux
 * requêtes sur la base qui protège le stock. Avec 2 s de cache, chaque instance du Cœur lit
 * PostgreSQL au plus une fois toutes les 2 s par vente, quel que soit le nombre d'acheteurs ; les
 * demandes simultanées partagent la même lecture.
 *
 * Écart assumé avec l'ADR 015 (disponibilités lues dans la projection, jamais en cache dans le
 * Cœur) en attendant la projection du Catalogue : c'est une dette à inscrire au registre.
 */
export class LecturePlanEnCache implements LecturePlan {
  private readonly entrees = new Map<
    string,
    { expireLe: number; plan: Promise<PlanDeSalle | null> }
  >();

  constructor(
    private readonly interne: LecturePlan,
    private readonly dureeMs = 2_000,
    private readonly horloge: () => number = Date.now,
  ) {}

  lire(evenementId: string): Promise<PlanDeSalle | null> {
    const maintenant = this.horloge();
    const entree = this.entrees.get(evenementId);
    if (entree && entree.expireLe > maintenant) return entree.plan;

    const plan = this.interne.lire(evenementId);
    this.entrees.set(evenementId, { expireLe: maintenant + this.dureeMs, plan });
    // Une lecture en échec n'est pas gardée : la suivante réessaie.
    plan.catch(() => this.entrees.delete(evenementId));
    return plan;
  }
}
