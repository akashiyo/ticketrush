import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { CONFIG, type Config } from "./infrastructure/config.js";

async function demarrer(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const config = app.get<Config>(CONFIG);
  if (!config.jetonClePriveePem) {
    new Logger("FileAttente").warn(
      "JETON_CLE_PRIVEE_PEM absente : clé de signature générée au démarrage. " +
        "Les jetons émis avant un redémarrage deviennent invalides, et plusieurs " +
        "instances ne partageraient pas la même clé.",
    );
  }
  await app.listen(config.port, "0.0.0.0");
}

void demarrer();
