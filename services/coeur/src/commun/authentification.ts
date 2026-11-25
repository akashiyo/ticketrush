import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  mixin,
  type Type,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { createRemoteJWKSet, type JWTPayload, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Authentification des acheteurs et des organisateurs par leur jeton Keycloak (ADR 010).
 *
 * Zéro confiance : le Cœur vérifie lui-même chaque jeton, localement, avec les clés publiques de
 * Keycloak mises en cache. Même principe que dans la File d'attente ; le code est recopié et non
 * partagé, pour ne pas coupler deux services (cours : « un peu de duplication vaut mieux qu'un
 * couplage »).
 */

/** Contenu utile d'un jeton Keycloak vérifié. */
export interface Utilisateur {
  id: string;
  roles: string[];
  /** Présent pour les organisateurs (ADR 016). */
  organisationId: string | null;
}

export type VerificateurJeton = (jeton: string) => Promise<JWTPayload>;
export const VERIFICATEUR_JETON = Symbol("VerificateurJeton");

export function creerVerificateur(
  cles: JWTVerifyGetKey,
  attendu: { emetteur: string; audience: string },
): VerificateurJeton {
  return async (jeton) =>
    (await jwtVerify(jeton, cles, { issuer: attendu.emetteur, audience: attendu.audience }))
      .payload;
}

export function creerVerificateurKeycloak(config: {
  authJwksUrl: string;
  authEmetteur: string;
  authAudience: string;
}): VerificateurJeton {
  return creerVerificateur(createRemoteJWKSet(new URL(config.authJwksUrl)), {
    emetteur: config.authEmetteur,
    audience: config.authAudience,
  });
}

export type RequeteAuthentifiee = Request & { utilisateur: Utilisateur };

/** Garde qui exige un jeton Keycloak valide portant le rôle demandé. */
export function ExigerRole(role: string): Type<CanActivate> {
  return ExigerUnDesRoles([role]);
}

/** Garde qui exige un jeton Keycloak valide portant au moins un des rôles demandés. */
export function ExigerUnDesRoles(rolesAcceptes: readonly string[]): Type<CanActivate> {
  @Injectable()
  class GardeRole implements CanActivate {
    constructor(@Inject(VERIFICATEUR_JETON) private readonly verifier: VerificateurJeton) {}

    async canActivate(contexte: ExecutionContext): Promise<boolean> {
      const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
      const [schema, jeton] = (requete.headers.authorization ?? "").split(" ");
      if (schema !== "Bearer" || !jeton) {
        throw new UnauthorizedException("Connexion requise");
      }
      let contenu: JWTPayload;
      try {
        contenu = await this.verifier(jeton);
      } catch {
        throw new UnauthorizedException("Jeton invalide ou expiré");
      }
      const roles = (contenu.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
      if (!contenu.sub || !rolesAcceptes.some((r) => roles.includes(r))) {
        throw new ForbiddenException(`Rôle requis : ${rolesAcceptes.join(" ou ")}`);
      }
      const organisationId =
        typeof contenu.organisation_id === "string" ? contenu.organisation_id : null;
      requete.utilisateur = { id: contenu.sub, roles, organisationId };
      return true;
    }
  }
  return mixin(GardeRole);
}
