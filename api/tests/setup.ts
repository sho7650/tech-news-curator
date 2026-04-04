// Suppress log output during tests
process.env.LOG_LEVEL = "silent";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach } from "vitest";
import * as schema from "../src/db/schema/index.js";

let container: StartedPostgreSqlContainer;
let queryClient: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  const connectionUri = container.getConnectionUri();
  queryClient = postgres(connectionUri);
  testDb = drizzle(queryClient, { schema });

  await migrate(testDb, { migrationsFolder: "./src/db/migrations" });
}, 60000);

afterAll(async () => {
  await queryClient.end();
  await container.stop();
});

beforeEach(async () => {
  // Clean tables before each test (TRUNCATE is faster than drop/create)
  await queryClient.unsafe("TRUNCATE articles, sources, digests CASCADE");
});

export function getTestDb() {
  return testDb;
}

export function getQueryClient() {
  return queryClient;
}
