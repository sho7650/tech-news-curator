import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../database.js";

const health = new Hono();

health.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "healthy", db: "connected" });
  } catch {
    return c.json({ status: "unhealthy", db: "disconnected" }, 503);
  }
});

export { health };
