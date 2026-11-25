import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JournalJson } from "@ticketrush/observabilite";

import { AppModule } from "./app.module.js";
import { CONFIG, type Config } from "./infrastructure/config.js";

async function demarrer(): Promise<void> {
  // Journaux JSON avec trace_id, envoyés à Loki (ADR 017).
  const app = await NestFactory.create(AppModule, { logger: new JournalJson() });
  app.enableShutdownHooks();
  const config = app.get<Config>(CONFIG);
  const journal = new Logger("FileAttente");
  if (!config.altchaActif) {
    journal.warn(
      "ALTCHA_ACTIF=false : protection anti-robots DÉSACTIVÉE. Réservé au test de charge.",
    );
  } else if (!config.altchaSecret) {
    journal.warn(
      "ALTCHA_SECRET absent : secret des défis généré au démarrage (une seule instance).",
    );
  }
  if (!config.jetonClePriveePem) {
    journal.warn(
      "JETON_CLE_PRIVEE_PEM absente : clé de signature générée au démarrage. " +
        "Les jetons émis avant un redémarrage deviennent invalides, et plusieurs " +
        "instances ne partageraient pas la même clé.",
    );
  }
  await app.listen(config.port, "0.0.0.0");
}

void demarrer();
