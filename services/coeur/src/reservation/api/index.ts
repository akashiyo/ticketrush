/**
 * API du module Réservation : le seul point d'entrée visible des autres modules et de
 * l'assemblage du Cœur (ADR 002). Tout le reste du module est privé, vérifié par
 * dependency-cruiser (.dependency-cruiser.cjs).
 */
export { ReservationModule } from "../infrastructure/reservation.module.js";
/** Les ventes par événement, pour le dashboard des organisateurs. */
export {
  STATISTIQUES_VENTES,
  type StatistiquesVentes,
  type VentesEvenement,
} from "../domaine/ports.js";
