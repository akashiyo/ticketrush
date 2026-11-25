import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import { z } from "zod";

import { RechercherEvenements } from "../../application/rechercher-evenements.js";
import { LECTURE_FICHE, type LectureFiche } from "../../domaine/ports.js";

const UN_JOUR_MS = 24 * 3600 * 1000;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date au format AAAA-MM-JJ");
const texteCourt = z.string().trim().max(100);

const parametresRecherche = z
  .object({
    q: texteCourt.default(""),
    ville: texteCourt.optional(),
    genre: texteCourt.optional(),
    du: date.optional(),
    au: date.optional(),
    page: z.coerce.number().int().min(1).max(1_000).default(1),
    parPage: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

/**
 * API publique du Catalogue (sans connexion) : recherche et fiche d'événement.
 * Routée par Traefik sous /api/catalogue (ADR 013).
 */
@Controller("catalogue")
export class CatalogueController {
  constructor(
    private readonly rechercher: RechercherEvenements,
    @Inject(LECTURE_FICHE) private readonly fiches: LectureFiche,
  ) {}

  /**
   * Recherche par mots (titre, artiste, salle, ville ; fautes de frappe tolérées), filtrée par
   * ville, genre et dates (`du` et `au` inclus, AAAA-MM-JJ). Servie par Meilisearch seul (ADR 014).
   */
  @Get("recherche")
  async recherche(@Query() requete: unknown) {
    const lu = parametresRecherche.safeParse(requete);
    if (!lu.success) throw new BadRequestException("Paramètres de recherche invalides");
    const { q, ville, genre, du, au, page, parPage } = lu.data;
    try {
      return await this.rechercher.executer({
        texte: q,
        ...(ville ? { ville } : {}),
        ...(genre ? { genre } : {}),
        ...(du ? { du: new Date(`${du}T00:00:00Z`) } : {}),
        ...(au ? { avant: new Date(new Date(`${au}T00:00:00Z`).getTime() + UN_JOUR_MS) } : {}),
        page,
        parPage,
      });
    } catch {
      // Index indisponible : la recherche échoue proprement, la vente n'en dépend pas.
      throw new ServiceUnavailableException("Recherche momentanément indisponible");
    }
  }

  /** Fiche d'un événement publié : salle, date, catégories et prix (cache Redis, ADR 015). */
  @Get("evenements/:evenementId")
  async fiche(@Param("evenementId") evenementId: string) {
    if (!z.uuid().safeParse(evenementId).success)
      throw new BadRequestException("Événement invalide");
    const fiche = await this.fiches.lire(evenementId);
    if (!fiche) throw new NotFoundException("Événement introuvable");
    return fiche;
  }
}
