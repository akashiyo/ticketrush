import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { JournalJson } from "@ticketrush/observabilite";

import { AppModule } from "./app.module.js";
import { CONFIG, type Config } from "./infrastructure/config.js";

async function demarrer(): Promise<void> {
  // Journaux JSON avec trace_id, envoyés à Loki (ADR 017).
  const app = await NestFactory.create(AppModule, { logger: new JournalJson() });
  // Arrêt propre sur SIGTERM (docker compose stop).
  app.enableShutdownHooks();
  const config = app.get<Config>(CONFIG);
  await app.listen(config.port, "0.0.0.0");
}

void demarrer();
