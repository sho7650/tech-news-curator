import { Hono } from "hono";
import { db } from "../database.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { generateRssFeed } from "../services/rss-service.js";
import type { AppEnv } from "../types.js";

const feedRoute = new Hono<AppEnv>();

feedRoute.get("/feed/rss", createRateLimiter(30), async (c) => {
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

export { feedRoute };
