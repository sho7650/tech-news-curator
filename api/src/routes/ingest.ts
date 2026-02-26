import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { verifyApiKey } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { ingestRequestSchema } from "../schemas/ingest.js";
import { extractArticle } from "../services/ingest-service.js";
import { UnsafeURLError } from "../services/url-validator.js";

const ingestRoute = new Hono();

ingestRoute.post(
  "/ingest",
  createRateLimiter(10),
  verifyApiKey,
  zValidator("json", ingestRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
  async (c) => {
    const { url } = c.req.valid("json");
    try {
      const result = await extractArticle(url);
      if (!result) {
        return c.json({ detail: "Failed to extract content from URL" }, 422);
      }
      return c.json(result);
    } catch (err) {
      if (err instanceof UnsafeURLError) {
        return c.json({ detail: "URL points to a private or reserved address" }, 400);
      }
      throw err;
    }
  },
);

export { ingestRoute };
