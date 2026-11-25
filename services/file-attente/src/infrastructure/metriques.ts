import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { BatchObservableCallback, Counter, ObservableGauge } from "@opentelemetry/api";
import { mesureur } from "@ticketrush/observabilite";

import { DEPOT_FILE, type DepotFile } from "../domaine/ports.js";

/**
 * Métriques métier de la file d'attente (ADR 017), exportées en OpenTelemetry vers
 * Prometheus. Elles alimentent le tableau de bord de la vente et le SLO d'entrée (ADR 018).
 *
 * - `ticketrush_file_longueur`   : acheteurs encore en attente, par vente
 * - `ticketrush_file_admissions` : acheteurs admis (le débit s'obtient avec rate())
 */
@Injectable()
export class MetriquesFile implements OnModuleInit, OnModuleDestroy {
  private readonly mesure = mesureur("file-attente");
  readonly admissions: Counter = this.mesure.createCounter("ticketrush.file.admissions", {
    description: "Acheteurs admis dans la vente, avec un jeton d'accès signé",
    unit: "{acheteur}",
  });
  private readonly longueur: ObservableGauge = this.mesure.createObservableGauge(
    "ticketrush.file.longueur",
    { description: "Acheteurs encore en attente dans la file", unit: "{acheteur}" },
  );

  private readonly lireLongueurs: BatchObservableCallback = async (resultat) => {
    for (const evenementId of await this.depot.ventesConfigurees()) {
      resultat.observe(this.longueur, await this.depot.longueur(evenementId), {
        evenement_id: evenementId,
      });
    }
  };

  constructor(@Inject(DEPOT_FILE) private readonly depot: DepotFile) {}

  onModuleInit(): void {
    // Lue à chaque export (toutes les 10 s) : un ZCARD par vente, coût négligeable.
    this.mesure.addBatchObservableCallback(this.lireLongueurs, [this.longueur]);
  }

  onModuleDestroy(): void {
    this.mesure.removeBatchObservableCallback(this.lireLongueurs, [this.longueur]);
  }
}
