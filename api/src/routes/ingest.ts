import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { writeGuard } from "../middleware/guards.js";
import { validationHook } from "../middleware/validation.js";
import { API_KEY_SECURITY, errorResponse, jsonResponse } from "../openapi.js";
import { ingestRequestSchema, ingestResponseSchema } from "../schemas/ingest.js";
import { extractArticle } from "../services/ingest-service.js";
import { safeFetch } from "../services/safe-fetch.js";
import { UnsafeURLError } from "../services/url-validator.js";
import type { AppEnv } from "../types.js";

export type ExtractArticle = typeof extractArticle;

// The extractor is injectable so tests can mount the real route without network.
export function createIngestRoute(extract: ExtractArticle = extractArticle): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  route.post(
    "/ingest",
    ...writeGuard(10),
    describeRoute({
      tags: ["Ingest"],
      summary: "Fetch a URL and extract the article as Markdown (no storage)",
      security: API_KEY_SECURITY,
      responses: {
        200: jsonResponse("Extracted article", ingestResponseSchema),
        400: errorResponse("URL points to a private or reserved address"),
        401: errorResponse("Missing or invalid API key"),
        422: errorResponse("Fetch or extraction failed"),
      },
    }),
    validator("json", ingestRequestSchema, validationHook),
    async (c) => {
      const { url } = c.req.valid("json");
      const logger = c.get("logger");
      try {
        const result = await extract(url, safeFetch, logger);
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

  return route;
}
