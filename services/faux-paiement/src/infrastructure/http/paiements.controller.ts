import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { CreerPaiement } from "../../application/creer-paiement.js";
import type { Paiement } from "../../domaine/paiement.js";
import { DEPOT_PAIEMENTS, type DepotPaiements } from "../../domaine/ports.js";
import { demandesPaiement } from "../metriques.js";
import { JetonServiceGuard } from "./jeton-service.guard.js";

const schemaDemande = z.object({
  reference: z.string().min(1).max(100),
  montantCentimes: z.number().int().positive().max(10_000_000),
  devise: z.literal("EUR"),
  moyenDePaiement: z.object({ jeton: z.string().min(1).max(100) }),
});

const schemaCle = z.string().min(1).max(255);

@Controller("paiements")
@UseGuards(JetonServiceGuard)
export class PaiementsController {
  constructor(
    @Inject(CreerPaiement) private readonly creerPaiement: CreerPaiement,
    @Inject(DEPOT_PAIEMENTS) private readonly depot: DepotPaiements,
  ) {}

  /** Crée un paiement. L'en-tête Idempotency-Key est obligatoire (ADR 005). */
  @Post()
  @HttpCode(201)
  async creer(
    @Headers("idempotency-key") cle: string | undefined,
    @Body() corps: unknown,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<Paiement> {
    const cleValide = schemaCle.safeParse(cle);
    if (!cleValide.success) {
      throw new BadRequestException("En-tête Idempotency-Key obligatoire (1 à 255 caractères)");
    }
    const demande = schemaDemande.safeParse(corps);
    if (!demande.success) {
      throw new BadRequestException({
        message: "Demande de paiement invalide",
        erreurs: demande.error.issues.map((i) => ({ champ: i.path.join("."), message: i.message })),
      });
    }

    const resultat = await this.creerPaiement.executer(cleValide.data, demande.data);
    demandesPaiement.add(1, {
      resultat: resultat.type === "cree" ? resultat.paiement.statut : resultat.type,
    });
    if (resultat.type === "conflit") {
      throw new UnprocessableEntityException(
        "Cette clé d'idempotence a déjà servi pour une demande différente",
      );
    }
    if (resultat.type === "rejoue") {
      reponse.setHeader("Idempotent-Replayed", "true");
    }
    return resultat.paiement;
  }

  @Get(":id")
  async lire(@Param("id") id: string): Promise<Paiement> {
    const paiement = await this.depot.trouverParId(id);
    if (!paiement) {
      throw new NotFoundException("Paiement introuvable");
    }
    return paiement;
  }
}
