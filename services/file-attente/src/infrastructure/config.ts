/** Configuration du service, lue dans les variables d'environnement. */
export interface Config {
  port: number;
  redisUrl: string;
  /** Jetons des acheteurs et organisateurs, émis par Keycloak (ADR 010). */
  authEmetteur: string;
  authJwksUrl: string;
  authAudience: string;
  /** Émetteur des jetons d'admission signés par la File (ADR 011). */
  jetonEmetteur: string;
  /** Durée de validité d'un jeton d'admission : 10 minutes (ADR 011). */
  jetonDureeSec: number;
  /** Clé privée EC P-256 (PKCS#8) des jetons d'admission. Absente : clé générée au démarrage. */
  jetonClePriveePem: string | undefined;
  /** Intervalle entre deux tours d'admission ; 0 désactive le worker. */
  admissionIntervalleMs: number;
}

export const CONFIG = Symbol("Config");

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    authEmetteur: env.AUTH_EMETTEUR ?? "http://localhost:8180/realms/ticketrush",
    authJwksUrl:
      env.AUTH_JWKS_URL ?? "http://localhost:8180/realms/ticketrush/protocol/openid-connect/certs",
    authAudience: env.AUTH_AUDIENCE ?? "ticketrush-api",
    jetonEmetteur: env.JETON_EMETTEUR ?? "ticketrush-file-attente",
    jetonDureeSec: Number(env.JETON_DUREE_SEC ?? 600),
    jetonClePriveePem: env.JETON_CLE_PRIVEE_PEM?.replace(/\\n/g, "\n") || undefined,
    admissionIntervalleMs: Number(env.ADMISSION_INTERVALLE_MS ?? 1000),
  };
}
