import { Hono } from "hono";
import type { DB } from "../database.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { generateRssFeed } from "../services/rss-service.js";
import type { AppEnv } from "../types.js";

export function createFeedRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  route.get("/feed/rss", createRateLimiter(30), async (c) => {
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
  });

  return route;
}
