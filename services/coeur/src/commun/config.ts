/** Configuration du Cœur, lue dans les variables d'environnement. */
export interface Config {
  port: number;
  /** Base PostgreSQL : source de vérité du stock (ADR 004). */
  databaseUrl: string;
  /** Clés publiques des jetons d'accès, publiées par la File d'attente (ADR 011). */
  admissionJwksUrl: string;
  /** Émetteur attendu des jetons d'accès. */
  admissionEmetteur: string;
}

export const CONFIG = Symbol("Config");

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl:
      env.DATABASE_URL ?? "postgres://ticketrush:ticketrush_dev@localhost:5432/ticketrush",
    admissionJwksUrl: env.ADMISSION_JWKS_URL ?? "http://localhost:3001/.well-known/jwks.json",
    admissionEmetteur: env.ADMISSION_EMETTEUR ?? "ticketrush-file-attente",
  };
}
