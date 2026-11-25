import { type Meter, metrics } from "@opentelemetry/api";

export { JournalJson } from "./journal.js";

/**
 * Mesureur OpenTelemetry pour les métriques métier d'un service (ADR 017), à utiliser
 * dans la couche infrastructure. Sans SDK démarré (tests), les mesures sont ignorées.
 */
export function mesureur(nom: string): Meter {
  return metrics.getMeter(nom);
}
