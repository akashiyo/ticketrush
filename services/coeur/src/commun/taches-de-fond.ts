import { Logger } from "@nestjs/common";

/** Taille d'un lot traité par une tâche de fond (événements à publier, places expirées…). */
export const TAILLE_LOT = 500;

/**
 * Lance `tache` en boucle, toutes les `intervalleMs`. Une tâche qui renvoie un lot plein est
 * relancée aussitôt, pour vider le retard. Une erreur (broker ou base indisponible) est journalisée
 * et la tâche réessaie au tour suivant. Un intervalle à 0 désactive la tâche (tests).
 *
 * Renvoie la fonction d'arrêt.
 */
export function repeterEnFond(
  nom: string,
  intervalleMs: number,
  tache: () => Promise<number>,
  journal = new Logger("TachesDeFond"),
): () => void {
  if (intervalleMs <= 0) return () => undefined;
  let arret = false;
  let minuterie: NodeJS.Timeout;
  const tour = async (): Promise<void> => {
    let delai = intervalleMs;
    try {
      if ((await tache()) >= TAILLE_LOT) delai = 0;
    } catch (erreur) {
      journal.warn(`${nom} : ${(erreur as Error).message}`);
    }
    if (!arret) minuterie = setTimeout(() => void tour(), delai);
  };
  minuterie = setTimeout(() => void tour(), intervalleMs);
  return () => {
    arret = true;
    clearTimeout(minuterie);
  };
}
