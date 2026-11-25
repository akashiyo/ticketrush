/**
 * Passage de la salle d'attente (P2) à la réservation (P1).
 *
 * Contrat entre les deux pistes : quand l'acheteur est admis, la salle d'attente range
 * le jeton d'accès signé par la File (ADR 011) dans le sessionStorage, puis ouvre la
 * page de réservation. La page de P1 le lit et l'envoie au Cœur avec la réservation.
 */
export const cheminReservation = (evenementId: string) =>
  `/vente/${encodeURIComponent(evenementId)}/reservation`;

const cle = (evenementId: string) => `ticketrush.jetonAcces.${evenementId}`;

export interface JetonAcces {
  jetonAcces: string;
  expireLe: string;
}

export function rangerJetonAcces(evenementId: string, jeton: JetonAcces): void {
  sessionStorage.setItem(cle(evenementId), JSON.stringify(jeton));
}

/** Jeton d'accès de cette vente, ou null s'il est absent ou expiré. */
export function lireJetonAcces(evenementId: string, maintenant = new Date()): JetonAcces | null {
  const brut = sessionStorage.getItem(cle(evenementId));
  if (!brut) return null;
  const jeton = JSON.parse(brut) as JetonAcces;
  return new Date(jeton.expireLe) > maintenant ? jeton : null;
}
