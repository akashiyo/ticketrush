import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { type Admission, AdmissionRefusee } from "../domaine/blocage.js";
import type { VerificateurAdmission } from "../domaine/ports.js";

/** Audience des jetons d'accès : ils ne valent que pour la réservation (ADR 011). */
export const AUDIENCE_RESERVATION = "reservation";

/** Tolérance d'horloge entre la File et le Cœur, en secondes. */
const TOLERANCE_HORLOGE_SEC = 5;

/**
 * Vérification locale des jetons d'accès signés par la File d'attente (ADR 011, scénario S-2).
 *
 * - Signature ES256 uniquement : un jeton « alg: none » ou HS256 est refusé.
 * - Émetteur, audience et expiration vérifiés sans appel réseau.
 * - Les clés publiques viennent du JWKS de la File ; `createRemoteJWKSet` les met en cache et
 *   les recharge quand il rencontre un `kid` inconnu (nouvelle clé après redémarrage, D-015).
 */
export function creerVerificateurAdmission(
  cles: JWTVerifyGetKey,
  emetteur: string,
): VerificateurAdmission {
  return {
    async verifier(jetonAcces: string): Promise<Admission> {
      let contenu;
      try {
        ({ payload: contenu } = await jwtVerify(jetonAcces, cles, {
          algorithms: ["ES256"],
          issuer: emetteur,
          audience: AUDIENCE_RESERVATION,
          requiredClaims: ["sub", "evt", "jti", "exp"],
          clockTolerance: TOLERANCE_HORLOGE_SEC,
        }));
      } catch {
        throw new AdmissionRefusee("jeton d'accès invalide ou expiré");
      }
      const { sub, evt, jti, exp } = contenu;
      if (typeof sub !== "string" || typeof evt !== "string" || typeof jti !== "string" || !exp) {
        throw new AdmissionRefusee("jeton d'accès incomplet");
      }
      return { acheteurId: sub, evenementId: evt, jti, expireLe: new Date(exp * 1000) };
    },
  };
}

/** Vérificateur branché sur le JWKS publié par la File d'attente. */
export function creerVerificateurAdmissionFile(
  jwksUrl: string,
  emetteur: string,
): VerificateurAdmission {
  return creerVerificateurAdmission(createRemoteJWKSet(new URL(jwksUrl)), emetteur);
}
