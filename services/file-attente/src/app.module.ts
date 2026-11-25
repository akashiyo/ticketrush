import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";

import { FileAttente } from "./application/file-attente.js";
import {
  DEPOT_FILE,
  type DepotFile,
  HORLOGE,
  type Horloge,
  SIGNATAIRE_JETON,
} from "./domaine/ports.js";
import { AdmissionWorker } from "./infrastructure/admission.worker.js";
import { CONFIG, type Config, lireConfig } from "./infrastructure/config.js";
import { DepotFileRedis } from "./infrastructure/depot-redis.js";
import {
  creerVerificateurKeycloak,
  VERIFICATEUR_JETON,
} from "./infrastructure/http/authentification.js";
import { FilesController } from "./infrastructure/http/files.controller.js";
import { PublicsController } from "./infrastructure/http/publics.controller.js";
import { ProtectionRobots } from "./infrastructure/protection-robots.js";
import { SignataireJose } from "./infrastructure/signataire-jose.js";

export const REDIS = Symbol("Redis");

/** Assemblage : le domaine ne connaît que ses ports, l'infrastructure est branchée ici (ADR 020). */
@Module({
  controllers: [FilesController, PublicsController],
  providers: [
    { provide: CONFIG, useFactory: () => lireConfig() },
    { provide: HORLOGE, useValue: (() => new Date()) satisfies Horloge },
    {
      provide: REDIS,
      useFactory: (config: Config) => new Redis(config.redisUrl, { maxRetriesPerRequest: 2 }),
      inject: [CONFIG],
    },
    {
      provide: DEPOT_FILE,
      useFactory: (redis: Redis) => new DepotFileRedis(redis),
      inject: [REDIS],
    },
    {
      provide: ProtectionRobots,
      useFactory: (redis: Redis, horloge: Horloge, config: Config) =>
        ProtectionRobots.creer({
          redis,
          horloge,
          secret: config.altchaSecret,
          actif: config.altchaActif,
          difficulte: config.altchaDifficulte,
          dureeSec: config.altchaDureeSec,
        }),
      inject: [REDIS, HORLOGE, CONFIG],
    },
    {
      provide: SignataireJose,
      useFactory: (config: Config, horloge: Horloge) =>
        SignataireJose.creer({
          pemPkcs8: config.jetonClePriveePem,
          emetteur: config.jetonEmetteur,
          dureeSec: config.jetonDureeSec,
          horloge,
        }),
      inject: [CONFIG, HORLOGE],
    },
    { provide: SIGNATAIRE_JETON, useExisting: SignataireJose },
    {
      provide: FileAttente,
      useFactory: (
        depot: DepotFile,
        signataire: SignataireJose,
        horloge: Horloge,
        config: Config,
      ) => new FileAttente(depot, signataire, horloge, Math.random, config.jetonDureeSec),
      inject: [DEPOT_FILE, SIGNATAIRE_JETON, HORLOGE, CONFIG],
    },
    {
      provide: VERIFICATEUR_JETON,
      useFactory: (config: Config) => creerVerificateurKeycloak(config),
      inject: [CONFIG],
    },
    AdmissionWorker,
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
