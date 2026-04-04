import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_ADMIN_URL or DATABASE_URL must be set");
  }

  const migrationsFolder = path.resolve(process.cwd(), "src/db/migrations");

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    console.log("Running migrations...");
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied successfully.");
  } finally {
    await client.end();
  }
}
