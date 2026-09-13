import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { DB } from "../database.js";
import type { AppEnv } from "../types.js";

export function createHealthRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  route.get("/health", async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: "healthy", db: "connected" });
    } catch {
      return c.json({ status: "unhealthy", db: "disconnected" }, 503);
    }
  });

  return route;
}
