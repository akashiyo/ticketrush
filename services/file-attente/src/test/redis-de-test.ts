import { Redis } from "ioredis";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

/** Démarre un vrai Redis dans Docker pour les tests (Testcontainers, ADR 021). */
export async function demarrerRedis(): Promise<{
  url: string;
  client: Redis;
  arreter: () => Promise<void>;
}> {
  const conteneur: StartedTestContainer = await new GenericContainer("redis:8-alpine")
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start();
  const url = `redis://${conteneur.getHost()}:${conteneur.getMappedPort(6379)}`;
  const client = new Redis(url);
  return {
    url,
    client,
    arreter: async () => {
      await client.quit();
      await conteneur.stop();
    },
  };
}
