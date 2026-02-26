import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as schema from "../src/db/schema/index.js";

let container: StartedPostgreSqlContainer;
let queryClient: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  const connectionUri = container.getConnectionUri();
  queryClient = postgres(connectionUri);
  testDb = drizzle(queryClient, { schema });

  // Create tables
  await queryClient.unsafe(`
    CREATE TABLE IF NOT EXISTS articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_url TEXT NOT NULL UNIQUE,
      source_name VARCHAR(100),
      title_original TEXT,
      title_ja TEXT,
      body_original TEXT,
      body_translated TEXT,
      summary_ja TEXT,
      author VARCHAR(200),
      published_at TIMESTAMPTZ,
      og_image_url TEXT,
      categories TEXT[],
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_articles_published_at ON articles (published_at);

    CREATE TABLE IF NOT EXISTS sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100),
      rss_url TEXT NOT NULL UNIQUE,
      site_url TEXT,
      category VARCHAR(50),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS digests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      digest_date DATE NOT NULL UNIQUE,
      title TEXT,
      content TEXT,
      article_count INTEGER,
      article_ids UUID[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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
