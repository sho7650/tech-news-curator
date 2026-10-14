import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { DB } from "../database.js";
import { jsonResponse } from "../openapi.js";
import { healthResponseSchema } from "../schemas/health.js";
import type { AppEnv } from "../types.js";

export function createHealthRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  route.get(
    "/health",
    describeRoute({
      tags: ["Health"],
      summary: "Liveness and database connectivity",
      responses: {
        200: jsonResponse("Healthy", healthResponseSchema),
        503: jsonResponse("Database unreachable", healthResponseSchema),
      },
    }),
    async (c) => {
      try {
        await db.execute(sql`SELECT 1`);
        return c.json({ status: "healthy", db: "connected" });
      } catch {
        return c.json({ status: "unhealthy", db: "disconnected" }, 503);
      }
    },
  );

  return route;
}
