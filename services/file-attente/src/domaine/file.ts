/**
 * Règles de la file d'attente virtuelle (ADR 008 et 009), sans dépendance technique.
 */

/** Configuration d'une mise en vente pour la file d'attente. */
export interface Vente {
  evenementId: string;
  /** Instant d'ouverture de la vente : aucune admission avant. */
  ouvertureLe: Date;
  /** Nombre d'acheteurs admis par seconde, réglable pendant la vente. */
  debitParSeconde: number;
}

/**
 * Score d'entrée dans la file, plus petit = servi plus tôt (ADR 008).
 *
 * - Avant l'ouverture (salle d'attente) : score TIRÉ AU SORT entre 0 et 1. Arriver
 *   deux heures en avance ne donne aucun avantage, et un robot connecté en continu
 *   ne gagne rien.
 * - Après l'ouverture : l'heure d'arrivée mesurée par le serveur, en millisecondes.
 *   Elle est toujours supérieure à 1, donc tous les arrivés d'avant l'ouverture
 *   passent avant, puis premier arrivé, premier servi.
 */
export function scoreEntree(maintenant: Date, vente: Vente, aleatoire: () => number): number {
  return maintenant < vente.ouvertureLe ? aleatoire() : maintenant.getTime();
}

/** Temps d'attente estimé, en secondes : position ÷ débit d'admission. */
export function estimerAttenteSec(position: number, debitParSeconde: number): number {
  return Math.ceil(position / debitParSeconde);
}

/**
 * Délai avant le prochain appel du client (ADR 009) : court près de l'admission,
 * long loin dans la file, pour garder la charge maîtrisée.
 */
export function prochainAppelDansSec(position: number, debitParSeconde: number): number {
  const attente = estimerAttenteSec(position, debitParSeconde);
  if (attente <= 5) return 2;
  if (attente <= 60) return 5;
  if (attente <= 300) return 15;
  return 30;
}

/** Ce que voit un acheteur quand il consulte la file. */
export type EtatAcheteur =
  | {
      statut: "en_attente";
      position: number;
      attenteEstimeeSec: number;
      prochainAppelDansSec: number;
      ouvertureLe: string;
    }
  | { statut: "admis"; jetonAcces: string; expireLe: string }
  | { statut: "absent" };
