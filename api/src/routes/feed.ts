import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { DB } from "../database.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { errorResponse } from "../openapi.js";
import { generateRssFeed } from "../services/rss-service.js";
import type { AppEnv } from "../types.js";

export function createFeedRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  route.get(
    "/feed/rss",
    createRateLimiter(30),
    describeRoute({
      tags: ["Feed"],
      summary: "RSS 2.0 feed of the 20 newest articles",
      responses: {
        200: {
          description: "RSS feed",
          content: { "application/rss+xml": { schema: { type: "string" } } },
        },
        503: errorResponse("Feed generation failed"),
      },
    }),
    async (c) => {
      try {
        const rssXml = await generateRssFeed(db);
        return new Response(rssXml, {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
          },
        });
      } catch (err) {
        c.get("logger").error({ err }, "RSS feed generation failed");
        return c.json({ detail: "Feed generation failed" }, 503);
      }
    },
  );

  return route;
}
