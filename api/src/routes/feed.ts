import { Hono } from "hono";
import { db } from "../database.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { generateRssFeed } from "../services/rss-service.js";

const feedRoute = new Hono();

feedRoute.get("/feed/rss", createRateLimiter(30), async (c) => {
  const rssXml = await generateRssFeed(db);
  return new Response(rssXml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
});

export { feedRoute };
