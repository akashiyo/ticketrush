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

import type { Config } from "../config.js";

/** Contenu utile d'un jeton Keycloak vérifié (ADR 010). */
export interface Utilisateur {
  id: string;
  roles: string[];
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

/** Vérification locale avec les clés publiques de Keycloak, mises en cache (ADR 010). */
export function creerVerificateurKeycloak(config: Config): VerificateurJeton {
  return creerVerificateur(createRemoteJWKSet(new URL(config.authJwksUrl)), {
    emetteur: config.authEmetteur,
    audience: config.authAudience,
  });
}

export type RequeteAuthentifiee = Request & { utilisateur: Utilisateur };

/** Garde qui exige un jeton Keycloak valide portant le rôle demandé. */
export function ExigerRole(role: string): Type<CanActivate> {
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
      if (!contenu.sub || !roles.includes(role)) {
        throw new ForbiddenException(`Rôle « ${role} » requis`);
      }
      requete.utilisateur = { id: contenu.sub, roles };
      return true;
    }
  }
  return mixin(GardeRole);
}
