import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "./config.js";
import * as schema from "./db/schema/index.js";

export type DB = PostgresJsDatabase<typeof schema>;

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}="${raw}" — must be a non-negative integer`);
  }
  return parsed;
}

const queryClient = postgres(config.databaseUrl, {
  max: parseIntEnv("DB_POOL_MAX", 30),
  idle_timeout: parseIntEnv("DB_IDLE_TIMEOUT", 20),
  connect_timeout: parseIntEnv("DB_CONNECT_TIMEOUT", 10),
});

export const db = drizzle(queryClient, { schema });

export { queryClient };
