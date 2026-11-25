import { Module } from "@nestjs/common";

import { CatalogueModule } from "./catalogue/api/index.js";
import { CommunModule } from "./commun/commun.module.js";
import { ReservationModule } from "./reservation/api/index.js";

/**
 * Le Cœur : un monolithe modulaire (ADR 001). Chaque module n'est visible que par son `api/`.
 * Organisateurs s'ajoutera ici.
 */
@Module({
  imports: [CommunModule, CatalogueModule, ReservationModule],
})
export class AppModule {}
