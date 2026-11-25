import { Module } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Redis } from "ioredis";

import { BASE } from "../../commun/base-de-donnees.js";
import { REDIS } from "../../commun/commun.module.js";
import { CONFIG, type Config } from "../../commun/config.js";
import { ProjeterEvenement } from "../application/projeter-evenement.js";
import { RechercherEvenements } from "../application/rechercher-evenements.js";
import { INDEX_RECHERCHE, type IndexRecherche, LECTURE_FICHE } from "../domaine/ports.js";
import { CacheRedis } from "./cache-redis.js";
import { FichesPostgres, LectureFichePostgres } from "./fiches-postgres.js";
import { CatalogueController } from "./http/catalogue.controller.js";
import { IndexMeilisearch } from "./index-meilisearch.js";
import { InitialisationCatalogue } from "./initialisation-catalogue.js";
import { LectureFicheEnCache } from "./lecture-fiche-en-cache.js";
import { TachesCatalogue } from "./taches-catalogue.js";

/** Assemblage du module Catalogue : le côté lecture du CQRS (ADR 014, 015, 023). */
@Module({
  controllers: [CatalogueController],
  providers: [
    InitialisationCatalogue,
    TachesCatalogue,
    {
      provide: INDEX_RECHERCHE,
      useFactory: (config: Config) => IndexMeilisearch.creer(config.meiliUrl, config.meiliCle),
      inject: [CONFIG],
    },
    {
      provide: FichesPostgres,
      useFactory: (db: NodePgDatabase) => new FichesPostgres(db),
      inject: [BASE],
    },
    // La fiche : lecture PostgreSQL derrière le cache-aside Redis (décorateur)
    {
      provide: LectureFicheEnCache,
      useFactory: (fiches: FichesPostgres, redis: Redis) =>
        new LectureFicheEnCache(new LectureFichePostgres(fiches), new CacheRedis(redis)),
      inject: [FichesPostgres, REDIS],
    },
    { provide: LECTURE_FICHE, useExisting: LectureFicheEnCache },
    {
      provide: ProjeterEvenement,
      useFactory: (index: IndexRecherche, fiches: FichesPostgres) =>
        new ProjeterEvenement([fiches, index]),
      inject: [INDEX_RECHERCHE, FichesPostgres],
    },
    {
      provide: RechercherEvenements,
      useFactory: (index: IndexRecherche) => new RechercherEvenements(index),
      inject: [INDEX_RECHERCHE],
    },
  ],
})
export class CatalogueModule {}
