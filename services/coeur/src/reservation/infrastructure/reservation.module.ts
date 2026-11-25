import { randomUUID } from "node:crypto";

import { Module } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { BASE } from "../../commun/base-de-donnees.js";
import { CONFIG, type Config } from "../../commun/config.js";
import { BloquerPlace } from "../application/bloquer-place.js";
import {
  DEPOT_SIEGES,
  type DepotSieges,
  GENERATEUR_ID,
  type GenerateurId,
  VERIFICATEUR_ADMISSION,
  type VerificateurAdmission,
} from "../domaine/ports.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { MigrationsReservation } from "./migrations-reservation.js";
import { creerVerificateurAdmissionFile } from "./verificateur-admission-jose.js";

/** Assemblage du module Réservation : le domaine ne connaît que ses ports (ADR 020). */
@Module({
  providers: [
    MigrationsReservation,
    { provide: GENERATEUR_ID, useValue: (() => randomUUID()) satisfies GenerateurId },
    {
      provide: DEPOT_SIEGES,
      useFactory: (db: NodePgDatabase, nouvelId: GenerateurId) =>
        new DepotSiegesPostgres(db, nouvelId),
      inject: [BASE, GENERATEUR_ID],
    },
    {
      provide: VERIFICATEUR_ADMISSION,
      useFactory: (config: Config) =>
        creerVerificateurAdmissionFile(config.admissionJwksUrl, config.admissionEmetteur),
      inject: [CONFIG],
    },
    {
      provide: BloquerPlace,
      useFactory: (
        verificateur: VerificateurAdmission,
        depot: DepotSieges,
        nouvelId: GenerateurId,
      ) => new BloquerPlace(verificateur, depot, nouvelId),
      inject: [VERIFICATEUR_ADMISSION, DEPOT_SIEGES, GENERATEUR_ID],
    },
  ],
  exports: [BloquerPlace],
})
export class ReservationModule {}
