import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "./config.js";
import * as schema from "./db/schema/index.js";

export type DB = PostgresJsDatabase<typeof schema>;

const queryClient = postgres(config.databaseUrl, {
  max: Number.parseInt(process.env.DB_POOL_MAX ?? "30", 10),
  idle_timeout: Number.parseInt(process.env.DB_IDLE_TIMEOUT ?? "20", 10),
  connect_timeout: Number.parseInt(process.env.DB_CONNECT_TIMEOUT ?? "10", 10),
});

export const db = drizzle(queryClient, { schema });

export { queryClient };
