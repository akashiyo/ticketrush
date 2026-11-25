import type { StatistiquesVentes } from "../../reservation/api/index.js";
import type { LectureVentes, ResumeVentes } from "../domaine/ports.js";

/** Les ventes lues auprès du module Réservation, par son api/ (ADR 002). */
export class VentesReservation implements LectureVentes {
  constructor(private readonly statistiques: StatistiquesVentes) {}

  parEvenement(evenementIds: string[]): Promise<Map<string, ResumeVentes>> {
    return this.statistiques.parEvenement(evenementIds);
  }
}
