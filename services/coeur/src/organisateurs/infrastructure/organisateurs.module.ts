import { randomUUID } from "node:crypto";

import { Module } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { BASE } from "../../commun/base-de-donnees.js";
import {
  ReservationModule,
  STATISTIQUES_VENTES,
  type StatistiquesVentes,
} from "../../reservation/api/index.js";
import { GestionEvenements } from "../application/gestion-evenements.js";
import {
  DEPOT_EVENEMENTS,
  type DepotEvenements,
  LECTURE_VENTES,
  type LectureVentes,
} from "../domaine/ports.js";
import { DepotEvenementsPostgres } from "./depot-evenements-postgres.js";
import { OrganisateursController } from "./http/organisateurs.controller.js";
import { InitialisationOrganisateurs } from "./initialisation-organisateurs.js";
import { VentesReservation } from "./ventes-reservation.js";

/** Assemblage du module Organisateurs : back-office multi-tenant (ADR 016, 023). */
@Module({
  imports: [ReservationModule],
  controllers: [OrganisateursController],
  providers: [
    InitialisationOrganisateurs,
    {
      provide: DEPOT_EVENEMENTS,
      useFactory: (db: NodePgDatabase) => new DepotEvenementsPostgres(db),
      inject: [BASE],
    },
    {
      provide: LECTURE_VENTES,
      useFactory: (statistiques: StatistiquesVentes) => new VentesReservation(statistiques),
      inject: [STATISTIQUES_VENTES],
    },
    {
      provide: GestionEvenements,
      useFactory: (depot: DepotEvenements, ventes: LectureVentes) =>
        new GestionEvenements(depot, ventes, randomUUID, () => new Date()),
      inject: [DEPOT_EVENEMENTS, LECTURE_VENTES],
    },
  ],
})
export class OrganisateursModule {}
