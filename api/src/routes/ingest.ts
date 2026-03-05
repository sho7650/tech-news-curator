import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { verifyApiKey } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { validationHook } from "../middleware/validation.js";
import { ingestRequestSchema } from "../schemas/ingest.js";
import { extractArticle } from "../services/ingest-service.js";
import { safeFetch } from "../services/safe-fetch.js";
import { UnsafeURLError } from "../services/url-validator.js";
import type { AppEnv } from "../types.js";

const ingestRoute = new Hono<AppEnv>();

ingestRoute.post(
  "/ingest",
  createRateLimiter(10),
  verifyApiKey,
  zValidator("json", ingestRequestSchema, validationHook),
  async (c) => {
    const { url } = c.req.valid("json");
    const logger = c.get("logger");
    try {
      const result = await extractArticle(url, safeFetch, logger);
      if (!result) {
        return c.json({ detail: "Failed to extract content from URL" }, 422);
      }
      return c.json(result);
    } catch (err) {
      if (err instanceof UnsafeURLError) {
        logger.warn({ url, error: err.message }, "unsafe URL rejected");
        return c.json({ detail: "URL points to a private or reserved address" }, 400);
      }
      throw err;
    }
  },
);

export { ingestRoute };
