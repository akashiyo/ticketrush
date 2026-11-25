import { randomUUID } from "node:crypto";

import { Module } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { BASE } from "../../commun/base-de-donnees.js";
import { CONFIG, type Config } from "../../commun/config.js";
import { BloquerPlace } from "../application/bloquer-place.js";
import { PayerReservation } from "../application/payer-reservation.js";
import {
  DEPOT_RESERVATIONS,
  DEPOT_SIEGES,
  type DepotReservations,
  type DepotSieges,
  GENERATEUR_ID,
  type GenerateurId,
  HORLOGE,
  type Horloge,
  LECTURE_PLAN,
  PASSERELLE_PAIEMENT,
  type PasserelleDePaiement,
  VERIFICATEUR_ADMISSION,
  type VerificateurAdmission,
} from "../domaine/ports.js";
import { DepotReservationsPostgres } from "./depot-reservations-postgres.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { ReservationsController } from "./http/reservations.controller.js";
import { LecturePlanEnCache } from "./lecture-plan-en-cache.js";
import { LecturePlanPostgres } from "./lecture-plan-postgres.js";
import { InitialisationReservation } from "./migrations-reservation.js";
import { ProducteurKafka } from "./outbox/producteur-kafka.js";
import { RelaisOutbox } from "./outbox/relais-outbox.js";
import { Disjoncteur } from "./paiement/disjoncteur.js";
import { creerFournisseurJetonService } from "./paiement/jeton-service.js";
import { PasserelleFauxPaiement } from "./paiement/passerelle-faux-paiement.js";
import { TachesPeriodiques } from "./taches-periodiques.js";
import { creerVerificateurAdmissionFile } from "./verificateur-admission-jose.js";

/** Assemblage du module Réservation : le domaine ne connaît que ses ports (ADR 020). */
@Module({
  controllers: [ReservationsController],
  providers: [
    InitialisationReservation,
    TachesPeriodiques,
    { provide: GENERATEUR_ID, useValue: (() => randomUUID()) satisfies GenerateurId },
    { provide: HORLOGE, useValue: (() => new Date()) satisfies Horloge },

    // Adaptateurs PostgreSQL
    {
      provide: DepotSiegesPostgres,
      useFactory: (db: NodePgDatabase, nouvelId: GenerateurId) =>
        new DepotSiegesPostgres(db, nouvelId),
      inject: [BASE, GENERATEUR_ID],
    },
    { provide: DEPOT_SIEGES, useExisting: DepotSiegesPostgres },
    {
      provide: DEPOT_RESERVATIONS,
      useFactory: (db: NodePgDatabase, nouvelId: GenerateurId) =>
        new DepotReservationsPostgres(db, nouvelId),
      inject: [BASE, GENERATEUR_ID],
    },

    // Plan de salle : lecture PostgreSQL derrière un cache de 2 s (décorateur)
    {
      provide: LECTURE_PLAN,
      useFactory: (db: NodePgDatabase) => new LecturePlanEnCache(new LecturePlanPostgres(db)),
      inject: [BASE],
    },

    // Jeton d'accès de la File (ADR 011)
    {
      provide: VERIFICATEUR_ADMISSION,
      useFactory: (config: Config) =>
        creerVerificateurAdmissionFile(config.admissionJwksUrl, config.admissionEmetteur),
      inject: [CONFIG],
    },

    // Prestataire de paiement (ADR 005)
    {
      provide: PASSERELLE_PAIEMENT,
      useFactory: (config: Config) =>
        new PasserelleFauxPaiement({
          url: config.paiementUrl,
          obtenirJeton: creerFournisseurJetonService({
            urlJeton: config.paiementJetonUrl,
            clientId: config.paiementClientId,
            clientSecret: config.paiementClientSecret,
          }),
          disjoncteur: new Disjoncteur(),
        }),
      inject: [CONFIG],
    },

    // Outbox → Redpanda (ADR 006, 007)
    {
      provide: ProducteurKafka,
      useFactory: (config: Config) => new ProducteurKafka(config.kafkaBrokers),
      inject: [CONFIG],
    },
    {
      provide: RelaisOutbox,
      useFactory: (db: NodePgDatabase, producteur: ProducteurKafka) =>
        new RelaisOutbox(db, producteur),
      inject: [BASE, ProducteurKafka],
    },

    // Cas d'usage
    {
      provide: BloquerPlace,
      useFactory: (
        verificateur: VerificateurAdmission,
        depot: DepotSieges,
        nouvelId: GenerateurId,
      ) => new BloquerPlace(verificateur, depot, nouvelId),
      inject: [VERIFICATEUR_ADMISSION, DEPOT_SIEGES, GENERATEUR_ID],
    },
    {
      provide: PayerReservation,
      useFactory: (depot: DepotReservations, passerelle: PasserelleDePaiement, horloge: Horloge) =>
        new PayerReservation(depot, passerelle, horloge),
      inject: [DEPOT_RESERVATIONS, PASSERELLE_PAIEMENT, HORLOGE],
    },
  ],
})
export class ReservationModule {}
