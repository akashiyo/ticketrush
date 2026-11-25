import type { Counter } from "@opentelemetry/api";
import { mesureur } from "@ticketrush/observabilite";

/**
 * Métriques métier du faux prestataire (ADR 017) : `ticketrush_paiement_demandes`, par
 * résultat (accepte, refuse, rejoue, conflit). Pendant la démo de panne, on voit les
 * demandes s'arrêter quand le prestataire est coupé.
 */
export const demandesPaiement: Counter = mesureur("faux-paiement").createCounter(
  "ticketrush.paiement.demandes",
  { description: "Demandes de paiement reçues, par résultat", unit: "{demande}" },
);
