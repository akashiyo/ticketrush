/** Configuration du service, lue dans les variables d'environnement. */
export interface Config {
  port: number;
  /** Émetteur attendu des jetons de service (Keycloak, ADR 010). */
  authEmetteur: string;
  /** Adresse des clés publiques de Keycloak (JWKS). */
  authJwksUrl: string;
  /** Audience attendue : le jeton doit être destiné à ce service. */
  authAudience: string;
}

export const CONFIG = Symbol("Config");

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    authEmetteur: env.AUTH_EMETTEUR ?? "http://localhost:8180/realms/ticketrush",
    authJwksUrl:
      env.AUTH_JWKS_URL ?? "http://localhost:8180/realms/ticketrush/protocol/openid-connect/certs",
    authAudience: env.AUTH_AUDIENCE ?? "ticketrush-faux-paiement",
  };
}
