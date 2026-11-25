import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { createRemoteJWKSet, type JWTPayload, jwtVerify, type JWTVerifyGetKey } from "jose";

import type { Config } from "../config.js";

/** Vérifie un jeton et renvoie son contenu, ou lève une erreur s'il est invalide. */
export type VerificateurJeton = (jeton: string) => Promise<JWTPayload>;

export const VERIFICATEUR_JETON = Symbol("VerificateurJeton");

/** Vérifie la signature, l'émetteur, l'audience et l'expiration d'un jeton. */
export function creerVerificateur(
  cles: JWTVerifyGetKey,
  attendu: { emetteur: string; audience: string },
): VerificateurJeton {
  return async (jeton) => {
    const { payload } = await jwtVerify(jeton, cles, {
      issuer: attendu.emetteur,
      audience: attendu.audience,
    });
    return payload;
  };
}

/**
 * Vérificateur de production : clés publiques de Keycloak, mises en cache par jose.
 * Aucun appel à Keycloak par requête une fois les clés en cache (ADR 010).
 */
export function creerVerificateurKeycloak(config: Config): VerificateurJeton {
  return creerVerificateur(createRemoteJWKSet(new URL(config.authJwksUrl)), {
    emetteur: config.authEmetteur,
    audience: config.authAudience,
  });
}

/**
 * Zéro confiance entre services (ADR 010) : seul un appelant muni d'un jeton de
 * service valide, destiné à ce service, peut créer ou lire un paiement.
 */
@Injectable()
export class JetonServiceGuard implements CanActivate {
  constructor(@Inject(VERIFICATEUR_JETON) private readonly verifier: VerificateurJeton) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const requete = contexte.switchToHttp().getRequest<Request>();
    const [schema, jeton] = (requete.headers.authorization ?? "").split(" ");
    if (schema !== "Bearer" || !jeton) {
      throw new UnauthorizedException("Jeton de service manquant");
    }
    try {
      await this.verifier(jeton);
      return true;
    } catch {
      throw new UnauthorizedException("Jeton de service invalide");
    }
  }
}
