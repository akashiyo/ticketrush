import { Module } from "@nestjs/common";

import { CreerPaiement } from "./application/creer-paiement.js";
import { DEPOT_PAIEMENTS, type DepotPaiements } from "./domaine/ports.js";
import { CONFIG, type Config, lireConfig } from "./infrastructure/config.js";
import { DepotPaiementsMemoire } from "./infrastructure/depot-memoire.js";
import {
  creerVerificateurKeycloak,
  JetonServiceGuard,
  VERIFICATEUR_JETON,
} from "./infrastructure/http/jeton-service.guard.js";
import { PaiementsController } from "./infrastructure/http/paiements.controller.js";
import { SanteController } from "./infrastructure/http/sante.controller.js";

/**
 * Assemblage du service : le domaine ne connaît que ses ports, l'infrastructure
 * (HTTP, dépôt, vérification des jetons) est branchée ici (ADR 020).
 */
@Module({
  controllers: [PaiementsController, SanteController],
  providers: [
    { provide: CONFIG, useFactory: () => lireConfig() },
    {
      provide: VERIFICATEUR_JETON,
      useFactory: (config: Config) => creerVerificateurKeycloak(config),
      inject: [CONFIG],
    },
    { provide: DEPOT_PAIEMENTS, useClass: DepotPaiementsMemoire },
    {
      provide: CreerPaiement,
      useFactory: (depot: DepotPaiements) => new CreerPaiement(depot),
      inject: [DEPOT_PAIEMENTS],
    },
    JetonServiceGuard,
  ],
})
export class AppModule {}
