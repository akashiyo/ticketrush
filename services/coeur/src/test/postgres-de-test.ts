import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { GenericContainer, getContainerRuntimeClient, Wait } from "testcontainers";

/**
 * Docker est-il disponible ? Sur une machine sans Docker, les tests d'intégration sont sautés ;
 * en CI (variable CI définie), ils ne le sont jamais : l'absence de Docker fait échouer la CI.
 */
export async function dockerDisponible(): Promise<boolean> {
  if (process.env.CI) return true;
  try {
    await getContainerRuntimeClient();
    return true;
  } catch {
    return false;
  }
}

/** Démarre un vrai PostgreSQL dans Docker, de la même version que le Compose (Testcontainers). */
export async function demarrerPostgres(): Promise<{
  pool: pg.Pool;
  db: NodePgDatabase;
  arreter: () => Promise<void>;
}> {
  const conteneur = await new GenericContainer("postgres:18-alpine")
    .withEnvironment({ POSTGRES_USER: "test", POSTGRES_PASSWORD: "test", POSTGRES_DB: "test" })
    .withExposedPorts(5432)
    // PostgreSQL redémarre une fois après l'initialisation : attendre le second message.
    .withWaitStrategy(Wait.forLogMessage(/ready to accept connections/, 2))
    .start();
  const pool = new pg.Pool({
    connectionString: `postgres://test:test@${conteneur.getHost()}:${conteneur.getMappedPort(5432)}/test`,
    max: 20,
  });
  // À l'arrêt du conteneur, PostgreSQL coupe les connexions encore ouvertes (code 57P01,
  // « terminating connection due to administrator command »). Le pool remonte cette coupure
  // par un événement « error » : sans gestionnaire, Node en fait une exception non interceptée
  // et Vitest échoue alors que tous les tests passent (dette D-028). Seule cette coupure
  // attendue est ignorée ; toute autre erreur reste fatale.
  pool.on("error", (erreur: Error & { code?: string }) => {
    if (erreur.code !== "57P01") throw erreur;
  });
  return {
    pool,
    db: drizzle(pool),
    arreter: async () => {
      await pool.end();
      await conteneur.stop();
    },
  };
}
