/** Configuration du Cœur, lue dans les variables d'environnement. */
export interface Config {
  port: number;
  /** Base PostgreSQL : source de vérité du stock (ADR 004). */
  databaseUrl: string;
  /** Jetons des acheteurs et organisateurs, émis par Keycloak (ADR 010). */
  authEmetteur: string;
  authJwksUrl: string;
  authAudience: string;
  /** Clés publiques des jetons d'accès, publiées par la File d'attente (ADR 011). */
  admissionJwksUrl: string;
  /** Émetteur attendu des jetons d'accès. */
  admissionEmetteur: string;
  /** Faux prestataire de paiement (P2) et jeton de service du Cœur (ADR 005, 010). */
  paiementUrl: string;
  paiementJetonUrl: string;
  paiementClientId: string;
  paiementClientSecret: string;
  /** Redis : cache des fiches d'événement (ADR 015). */
  redisUrl: string;
  /** Meilisearch : modèle de lecture du catalogue (ADR 014). */
  meiliUrl: string;
  meiliCle: string;
  /** Brokers Redpanda pour le relais de l'Outbox (ADR 006, 007). */
  kafkaBrokers: string[];
  /** Intervalle du relais de l'Outbox ; 0 le désactive. */
  relaisIntervalleMs: number;
  /** Intervalle de libération des blocages expirés ; 0 le désactive. */
  expirationIntervalleMs: number;
  /** Charge les données de démonstration (catalogue, vente de 5 000 places) au démarrage. */
  donneesDemo: boolean;
}

export const CONFIG = Symbol("Config");

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const keycloak = env.KEYCLOAK_URL ?? "http://localhost:8180/realms/ticketrush";
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl:
      env.DATABASE_URL ?? "postgres://ticketrush:ticketrush_dev@localhost:5432/ticketrush",
    authEmetteur: env.AUTH_EMETTEUR ?? "http://localhost:8180/realms/ticketrush",
    authJwksUrl: env.AUTH_JWKS_URL ?? `${keycloak}/protocol/openid-connect/certs`,
    authAudience: env.AUTH_AUDIENCE ?? "ticketrush-api",
    admissionJwksUrl: env.ADMISSION_JWKS_URL ?? "http://localhost:3001/.well-known/jwks.json",
    admissionEmetteur: env.ADMISSION_EMETTEUR ?? "ticketrush-file-attente",
    paiementUrl: env.PAIEMENT_URL ?? "http://localhost:3003",
    paiementJetonUrl: env.PAIEMENT_JETON_URL ?? `${keycloak}/protocol/openid-connect/token`,
    paiementClientId: env.PAIEMENT_CLIENT_ID ?? "ticketrush-coeur",
    paiementClientSecret: env.PAIEMENT_CLIENT_SECRET ?? "ticketrush-coeur-secret-dev",
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    meiliUrl: env.MEILI_URL ?? "http://localhost:7700",
    meiliCle: env.MEILI_CLE ?? "ticketrush_dev_meili_cle_maitre",
    kafkaBrokers: (env.KAFKA_BROKERS ?? "localhost:19092").split(","),
    relaisIntervalleMs: Number(env.RELAIS_INTERVALLE_MS ?? 200),
    expirationIntervalleMs: Number(env.EXPIRATION_INTERVALLE_MS ?? 5_000),
    donneesDemo: env.DONNEES_DEMO === "true",
  };
}
