import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { ExigerRole, type RequeteAuthentifiee } from "../../../commun/authentification.js";
import { BloquerPlace } from "../../application/bloquer-place.js";
import { PayerReservation } from "../../application/payer-reservation.js";
import { AdmissionRefusee, PlaceIndisponible } from "../../domaine/blocage.js";
import { LECTURE_PLAN, type LecturePlan } from "../../domaine/ports.js";
import {
  type Billet,
  DelaiDePaiementDepasse,
  PaiementIndisponible,
  PaiementRefuse,
  PlacePerdueApresPaiement,
  ReservationIntrouvable,
} from "../../domaine/reservation.js";

const identifiant = z.uuid();
const corpsBlocage = z.union([
  z.object({ siegeId: z.uuid() }).strict(),
  z.object({ categorieId: z.uuid() }).strict(),
]);
const corpsPaiement = z.object({
  moyenDePaiement: z.object({ jeton: z.string().min(1).max(100) }),
});
const cleIdempotence = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

function lire<T>(schema: z.ZodType<T>, valeur: unknown, quoi: string): T {
  const resultat = schema.safeParse(valeur);
  if (!resultat.success) throw new BadRequestException(`${quoi} invalide`);
  return resultat.data;
}

/** Erreurs du domaine → réponses HTTP. Toute autre erreur reste une 500. */
function traduire(erreur: unknown): never {
  if (erreur instanceof AdmissionRefusee) throw new ForbiddenException(erreur.message);
  if (erreur instanceof PlaceIndisponible) throw new ConflictException(erreur.message);
  if (erreur instanceof ReservationIntrouvable) throw new NotFoundException(erreur.message);
  if (erreur instanceof DelaiDePaiementDepasse) throw new ConflictException(erreur.message);
  if (erreur instanceof PlacePerdueApresPaiement) throw new ConflictException(erreur.message);
  if (erreur instanceof PaiementRefuse) {
    throw new HttpException(erreur.message, HttpStatus.PAYMENT_REQUIRED);
  }
  if (erreur instanceof PaiementIndisponible) {
    throw new ServiceUnavailableException(
      "Paiement momentanément indisponible : réessayez, votre place reste bloquée",
    );
  }
  throw erreur;
}

const versReponseBillet = (b: Billet) => ({ ...b, emisLe: b.emisLe.toISOString() });

/**
 * API de la Réservation (ADR 005 : synchrone, l'acheteur attend la réponse).
 * Toutes les routes exigent un acheteur connecté (jeton Keycloak, rôle `acheteur`).
 */
@Controller()
@UseGuards(ExigerRole("acheteur"))
export class ReservationsController {
  constructor(
    private readonly bloquerPlace: BloquerPlace,
    private readonly payerReservation: PayerReservation,
    @Inject(LECTURE_PLAN) private readonly lecturePlan: LecturePlan,
  ) {}

  /** Plan de salle : catégories, prix, places disponibles (indicatif, rafraîchi toutes les 2 s). */
  @Get("evenements/:evenementId/plan")
  async plan(@Param("evenementId") evenementIdBrut: string) {
    const evenementId = lire(identifiant, evenementIdBrut, "Événement");
    const plan = await this.lecturePlan.lire(evenementId);
    if (!plan) throw new NotFoundException("Vente inconnue");
    return plan;
  }

  /**
   * Bloquer une place pendant 10 minutes. En-tête `Jeton-Acces` : le jeton remis par la File.
   * Corps : `{ "siegeId": … }` (siège numéroté) ou `{ "categorieId": … }` (placement libre).
   * 201 bloquée · 403 jeton refusé · 409 place déjà prise.
   */
  @Post("evenements/:evenementId/blocages")
  @HttpCode(201)
  async bloquer(
    @Param("evenementId") evenementIdBrut: string,
    @Headers("jeton-acces") jetonAcces: string | undefined,
    @Body() corpsBrut: unknown,
    @Req() requete: RequeteAuthentifiee,
  ) {
    const evenementId = lire(identifiant, evenementIdBrut, "Événement");
    const corps = lire(corpsBlocage, corpsBrut, "Demande");
    if (!jetonAcces) throw new ForbiddenException("Jeton d'accès requis : passez par la file");
    try {
      const blocage = await this.bloquerPlace.executer({
        acheteurId: requete.utilisateur.id,
        jetonAcces,
        demande:
          "siegeId" in corps
            ? { type: "siege", evenementId, siegeId: corps.siegeId }
            : { type: "placement-libre", evenementId, categorieId: corps.categorieId },
      });
      return {
        reservationId: blocage.reservationId,
        siegeId: blocage.siegeId,
        categorieId: blocage.categorieId,
        bloqueJusqua: blocage.bloqueJusqua.toISOString(),
      };
    } catch (erreur) {
      traduire(erreur);
    }
  }

  /**
   * Payer une réservation et recevoir le billet. En-tête `Idempotency-Key` obligatoire : un même
   * appel rejoué (double clic, nouvelle tentative du navigateur) ne paie qu'une fois.
   * 201 billet · 402 refusé · 404 inconnue · 409 délai dépassé · 503 prestataire indisponible.
   */
  @Post("reservations/:reservationId/paiement")
  @HttpCode(201)
  async payer(
    @Param("reservationId") reservationIdBrut: string,
    @Headers("idempotency-key") cleBrute: string | undefined,
    @Body() corpsBrut: unknown,
    @Req() requete: RequeteAuthentifiee,
  ) {
    const reservationId = lire(identifiant, reservationIdBrut, "Réservation");
    const cle = lire(cleIdempotence, cleBrute, "En-tête Idempotency-Key");
    const corps = lire(corpsPaiement, corpsBrut, "Demande");
    try {
      const billet = await this.payerReservation.executer({
        acheteurId: requete.utilisateur.id,
        reservationId,
        cleIdempotence: cle,
        moyenDePaiement: corps.moyenDePaiement,
      });
      return versReponseBillet(billet);
    } catch (erreur) {
      traduire(erreur);
    }
  }
}
