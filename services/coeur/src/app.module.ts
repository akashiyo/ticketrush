import { Module } from "@nestjs/common";

import { CommunModule } from "./commun/commun.module.js";
import { ReservationModule } from "./reservation/api/index.js";

/**
 * Le Cœur : un monolithe modulaire (ADR 001). Chaque module n'est visible que par son `api/`.
 * Catalogue et Organisateurs s'ajouteront ici.
 */
@Module({
  imports: [CommunModule, ReservationModule],
})
export class AppModule {}
