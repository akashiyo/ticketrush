/**
 * Seuils de durée des SLO (ADR 018), en secondes. Chaque seuil doit être une borne exacte de
 * l'histogramme HTTP : sinon Prometheus ne peut pas compter les requêtes « en moins de X ».
 */
export const SEUILS_SLO_SECONDES = {
  /** Recherche (P-3) : 99 % en moins de 300 ms. */
  recherche: 0.3,
  /** Réservation (P-2) : 99 % des blocages en moins de 500 ms. */
  reservation: 0.5,
  /** Entrée dans la file (P-1) : 99 % des entrées et positions en moins de 2 s. */
  entreeFile: 2,
} as const;

/**
 * Bornes de l'histogramme `http.server.request.duration` (secondes). Celles par défaut
 * d'OpenTelemetry (… 0,25 ; 0,5 ; 0,75 ; 1 ; 2,5 …) n'ont ni 0,3 ni 2 : on les remplace.
 */
export const BORNES_DUREE_HTTP_SECONDES = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 2, 3, 5, 10,
] as const;
