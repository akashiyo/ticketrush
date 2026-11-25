import { Module } from "@nestjs/common";

import { CatalogueModule } from "./catalogue/api/index.js";
import { CommunModule } from "./commun/commun.module.js";
import { OrganisateursModule } from "./organisateurs/api/index.js";
import { ReservationModule } from "./reservation/api/index.js";

/**
 * Le Cœur : un monolithe modulaire (ADR 001). Chaque module n'est visible que par son `api/` :
 * les Organisateurs écrivent les événements, le Catalogue les projette, la Réservation les vend.
 */
@Module({
  imports: [CommunModule, OrganisateursModule, CatalogueModule, ReservationModule],
})
export class AppModule {}
