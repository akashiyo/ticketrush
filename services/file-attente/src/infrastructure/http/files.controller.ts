import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { FileAttente, VenteInconnueErreur } from "../../application/file-attente.js";
import type { EtatAcheteur } from "../../domaine/file.js";
import { ExigerRole, type RequeteAuthentifiee } from "./authentification.js";

const schemaEvenementId = z.string().min(1).max(100);
const schemaVente = z.object({
  ouvertureLe: z.iso.datetime({ offset: true }),
  debitParSeconde: z.number().int().min(1).max(10_000),
});

@Controller("files/:evenementId")
export class FilesController {
  constructor(@Inject(FileAttente) private readonly file: FileAttente) {}

  /**
   * Configure la vente : ouverture et débit d'admission (ADR 008).
   * Provisoire : sera alimenté par l'événement EvenementPublie du Cœur (contrats v1).
   */
  @Put("vente")
  @HttpCode(204)
  @UseGuards(ExigerRole("organisateur-admin"))
  async configurer(
    @Param("evenementId") evenementId: string,
    @Body() corps: unknown,
  ): Promise<void> {
    const id = this.valider(evenementId);
    const vente = schemaVente.safeParse(corps);
    if (!vente.success) {
      throw new BadRequestException({
        message: "Configuration de vente invalide",
        erreurs: vente.error.issues.map((i) => ({ champ: i.path.join("."), message: i.message })),
      });
    }
    await this.file.configurerVente({
      evenementId: id,
      ouvertureLe: new Date(vente.data.ouvertureLe),
      debitParSeconde: vente.data.debitParSeconde,
    });
  }

  /** Entrée dans la file : compte acheteur obligatoire, une seule position par compte. */
  @Post("entrer")
  @HttpCode(200)
  @UseGuards(ExigerRole("acheteur"))
  entrer(
    @Param("evenementId") evenementId: string,
    @Req() requete: RequeteAuthentifiee,
  ): Promise<EtatAcheteur> {
    return this.gererVenteInconnue(() =>
      this.file.entrer(this.valider(evenementId), requete.utilisateur.id),
    );
  }

  /** Position, temps d'attente estimé et délai avant le prochain appel (ADR 009). */
  @Get("position")
  @UseGuards(ExigerRole("acheteur"))
  position(
    @Param("evenementId") evenementId: string,
    @Req() requete: RequeteAuthentifiee,
  ): Promise<EtatAcheteur> {
    return this.gererVenteInconnue(() =>
      this.file.consulter(this.valider(evenementId), requete.utilisateur.id),
    );
  }

  private valider(evenementId: string): string {
    const id = schemaEvenementId.safeParse(evenementId);
    if (!id.success) throw new BadRequestException("Identifiant d'événement invalide");
    return id.data;
  }

  private async gererVenteInconnue<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (erreur) {
      if (erreur instanceof VenteInconnueErreur) throw new NotFoundException(erreur.message);
      throw erreur;
    }
  }
}
