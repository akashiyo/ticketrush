import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { CONFIG, type Config } from "./commun/config.js";

async function demarrer(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const config = app.get<Config>(CONFIG);
  await app.listen(config.port, "0.0.0.0");
}

void demarrer();
