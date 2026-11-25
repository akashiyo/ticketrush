import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { FileAttente } from "../application/file-attente.js";
import { CONFIG, type Config } from "./config.js";
import { MetriquesFile } from "./metriques.js";

/**
 * Worker d'admission (ADR 008) : lance un tour d'admission à intervalle régulier.
 * Plusieurs instances peuvent tourner : le verrou Redis n'en laisse admettre qu'une.
 */
@Injectable()
export class AdmissionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly journal = new Logger(AdmissionWorker.name);
  private minuteur: NodeJS.Timeout | undefined;
  private enCours = false;

  constructor(
    @Inject(FileAttente) private readonly file: FileAttente,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(MetriquesFile) private readonly metriques: MetriquesFile,
  ) {}

  onModuleInit(): void {
    if (this.config.admissionIntervalleMs <= 0) return; // désactivé (tests)
    this.minuteur = setInterval(() => void this.tour(), this.config.admissionIntervalleMs);
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  private async tour(): Promise<void> {
    if (this.enCours) return; // un tour lent ne se chevauche pas avec le suivant
    this.enCours = true;
    try {
      const admis = await this.file.admettreUnTour();
      if (admis > 0) {
        this.metriques.admissions.add(admis);
        this.journal.log(`${admis} acheteur(s) admis`);
      }
    } catch (erreur) {
      this.journal.error("Tour d'admission en échec", erreur as Error);
    } finally {
      this.enCours = false;
    }
  }
}
