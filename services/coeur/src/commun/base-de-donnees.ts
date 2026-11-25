import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export const POOL = Symbol("Pool");
/** La base Drizzle partagée par les modules ; chacun n'écrit que dans son schéma (ADR 002). */
export const BASE = Symbol("BaseDeDonnees");

export function creerPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}

export function creerBase(pool: pg.Pool): NodePgDatabase {
  return drizzle(pool);
}
