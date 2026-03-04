import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "./config.js";
import * as schema from "./db/schema/index.js";

export type DB = PostgresJsDatabase<typeof schema>;

const queryClient = postgres(config.databaseUrl, {
  max: 30,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

export { queryClient };
