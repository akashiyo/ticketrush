import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { ExigerUnDesRoles, type RequeteAuthentifiee } from "../../../commun/authentification.js";
import { GestionEvenements } from "../../application/gestion-evenements.js";
import {
  ActionInterdite,
  type Evenement,
  EvenementIntrouvable,
  type Organisateur,
  RegleNonRespectee,
  ROLES_ORGANISATEUR,
} from "../../domaine/evenement.js";

const identifiant = z.uuid();
const texte = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.datetime({ offset: true }).transform((d) => new Date(d));

const corpsCreation = z
  .object({
    titre: texte(200),
    artiste: texte(200).nullable().default(null),
    genre: texte(50).nullable().default(null),
    salleId: identifiant,
    debutLe: date,
    tarifs: z
      .array(
        z.object({
          libelle: texte(50),
          placement: z.enum(["numerote", "libre"]),
          capacite: z.number().int(),
          prixCentimes: z.number().int(),
        }),
      )
      .min(1)
      .max(10),
  })
  .strict();

const corpsModification = z
  .object({
    titre: texte(200).optional(),
    artiste: texte(200).nullable().optional(),
    genre: texte(50).nullable().optional(),
    debutLe: date.optional(),
  })
  .strict();

const corpsPrix = z.object({ prixCentimes: z.number().int() }).strict();

function lire<T>(schema: z.ZodType<T, unknown>, valeur: unknown): T {
  const resultat = schema.safeParse(valeur);
  if (!resultat.success) throw new UnprocessableEntityException("Demande invalide");
  return resultat.data;
}

function traduire(erreur: unknown): never {
  if (erreur instanceof ActionInterdite) throw new ForbiddenException(erreur.message);
  if (erreur instanceof EvenementIntrouvable) throw new NotFoundException(erreur.message);
  if (erreur instanceof RegleNonRespectee) throw new UnprocessableEntityException(erreur.message);
  throw erreur;
}

function verifierIdentifiant(id: string): void {
  if (!identifiant.safeParse(id).success) throw new NotFoundException("Événement introuvable");
}

const versReponse = (e: Evenement) => ({ ...e, debutLe: e.debutLe.toISOString() });

/**
 * Le back-office des organisateurs (module Organisateurs, ADR 016), routé par Traefik sous
 * /api/organisateur. L'organisation vient **toujours** du jeton Keycloak, jamais d'un paramètre :
 * aucune route ne prend d'identifiant d'organisation.
 */
@Controller("organisateur")
@UseGuards(ExigerUnDesRoles(ROLES_ORGANISATEUR))
export class OrganisateursController {
  constructor(private readonly gestion: GestionEvenements) {}

  @Get("salles")
  salles() {
    return this.gestion.salles();
  }

  /** Ses événements, avec leurs ventes. */
  @Get("evenements")
  async lister(@Req() requete: RequeteAuthentifiee) {
    const liste = await this.gestion.lister(organisateur(requete));
    return liste.map((e) => ({ ...versReponse(e), ventes: e.ventes }));
  }

  @Get("evenements/:id")
  async consulter(@Param("id") id: string, @Req() requete: RequeteAuthentifiee) {
    verifierIdentifiant(id);
    try {
      return versReponse(await this.gestion.consulter(organisateur(requete), id));
    } catch (erreur) {
      traduire(erreur);
    }
  }

  /** Créer un brouillon. 201 · 403 rôle lecteur · 422 règle non respectée. */
  @Post("evenements")
  @HttpCode(201)
  async creer(@Body() corps: unknown, @Req() requete: RequeteAuthentifiee) {
    try {
      const demande = lire(corpsCreation, corps);
      return versReponse(await this.gestion.creer(organisateur(requete), demande));
    } catch (erreur) {
      traduire(erreur);
    }
  }

  @Patch("evenements/:id")
  async modifier(
    @Param("id") id: string,
    @Body() corps: unknown,
    @Req() requete: RequeteAuthentifiee,
  ) {
    verifierIdentifiant(id);
    try {
      const modification = lire(corpsModification, corps);
      return versReponse(await this.gestion.modifier(organisateur(requete), id, modification));
    } catch (erreur) {
      traduire(erreur);
    }
  }

  @Put("evenements/:id/tarifs/:tarifId/prix")
  async changerPrix(
    @Param("id") id: string,
    @Param("tarifId") tarifId: string,
    @Body() corps: unknown,
    @Req() requete: RequeteAuthentifiee,
  ) {
    verifierIdentifiant(id);
    try {
      const { prixCentimes } = lire(corpsPrix, corps);
      return versReponse(
        await this.gestion.changerPrix(organisateur(requete), id, tarifId, prixCentimes),
      );
    } catch (erreur) {
      traduire(erreur);
    }
  }

  /** Publier : l'événement entre au catalogue (EvenementPublie). */
  @Post("evenements/:id/publication")
  @HttpCode(200)
  async publier(@Param("id") id: string, @Req() requete: RequeteAuthentifiee) {
    verifierIdentifiant(id);
    try {
      return versReponse(await this.gestion.publier(organisateur(requete), id));
    } catch (erreur) {
      traduire(erreur);
    }
  }

  /** Les 100 dernières lignes du journal d'audit de son organisation (S-4). */
  @Get("journal")
  journal(@Req() requete: RequeteAuthentifiee) {
    return this.gestion.journal(organisateur(requete));
  }
}

/** L'organisateur connecté ; un compte sans organisation n'a pas accès au back-office. */
function organisateur(requete: RequeteAuthentifiee): Organisateur {
  const { id, roles, organisationId } = requete.utilisateur;
  if (!organisationId) throw new ForbiddenException("Compte sans organisation");
  return { organisationId, utilisateurId: id, roles };
}
