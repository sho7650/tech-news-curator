import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getTestDb } from "./setup.js";
import { createTestApp, jsonHeaders } from "./helpers.js";

function buildApp() {
  const app = createTestApp();
  const db = getTestDb();

  app.get("/health", async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: "healthy", db: "connected" });
    } catch {
      return c.json({ status: "unhealthy", db: "disconnected" }, 503);
    }
  });

  return app;
}

describe("GET /health", () => {
  it("should return healthy status", async () => {
    const app = buildApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.db).toBe("connected");
  });
});
