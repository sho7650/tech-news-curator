import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { DB } from "../database.js";
import { jstYesterday } from "../lib/jst-date.js";
import {
  formatDigestListItem,
  formatDigestResponse,
  formatDigestSourceArticle,
} from "../mappers/digest.js";
import { PG_UNIQUE_VIOLATION, getPgErrorCode } from "../middleware/error-handler.js";
import { writeGuard } from "../middleware/guards.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { validationHook } from "../middleware/validation.js";
import { API_KEY_SECURITY, errorResponse, jsonResponse } from "../openapi.js";
import { digestDateParamSchema } from "../schemas/base.js";
import {
  type DigestSourceResponse,
  digestCreateSchema,
  digestListQuerySchema,
  digestListResponseSchema,
  digestResponseSchema,
  digestSourceQuerySchema,
  digestSourceResponseSchema,
} from "../schemas/digest.js";
import { getArticlesForDigest } from "../services/article-service.js";
import { createDigest, getDigestByDate, getDigests } from "../services/digest-service.js";
import type { AppEnv } from "../types.js";

const TAGS = ["Digests"];

export function createDigestRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  // POST /digest
  route.post(
    "/digest",
    ...writeGuard(5),
    describeRoute({
      tags: TAGS,
      summary: "Store a daily digest",
      security: API_KEY_SECURITY,
      responses: {
        201: jsonResponse("Created digest", digestResponseSchema),
        401: errorResponse("Missing or invalid API key"),
        409: errorResponse("A digest for this date already exists"),
      },
    }),
    validator("json", digestCreateSchema, validationHook),
    async (c) => {
      const data = c.req.valid("json");
      try {
        const digest = await createDigest(db, data);
        return c.json(formatDigestResponse(digest), 201);
      } catch (err) {
        if (getPgErrorCode(err) === PG_UNIQUE_VIOLATION) {
          return c.json({ detail: "Digest for this date already exists" }, 409);
        }
        throw err;
      }
    },
  );

  // GET /digest
  route.get(
    "/digest",
    createRateLimiter(60),
    describeRoute({
      tags: TAGS,
      summary: "List digests, newest first",
      responses: { 200: jsonResponse("Paginated digests", digestListResponseSchema) },
    }),
    validator("query", digestListQuerySchema, validationHook),
    async (c) => {
      const { page, per_page } = c.req.valid("query");
      const { items, total } = await getDigests(db, page, per_page);
      return c.json({
        items: items.map(formatDigestListItem),
        total,
        page,
        per_page,
      });
    },
  );

  // GET /digest/source-articles — full source content for a JST day, for LLM digest generation.
  // Registered before /digest/:digest_date so the static segment is not parsed as a date.
  route.get(
    "/digest/source-articles",
    createRateLimiter(60),
    describeRoute({
      tags: TAGS,
      summary: "Full article bodies created on one JST day (defaults to yesterday)",
      responses: { 200: jsonResponse("Source articles", digestSourceResponseSchema) },
    }),
    validator("query", digestSourceQuerySchema, validationHook),
    async (c) => {
      const { date } = c.req.valid("query");
      const targetDate = date ?? jstYesterday(new Date());
      const { items, truncated } = await getArticlesForDigest(db, targetDate);
      const response: DigestSourceResponse = {
        date: targetDate,
        count: items.length,
        truncated,
        articles: items.map(formatDigestSourceArticle),
      };
      return c.json(response);
    },
  );

  // GET /digest/:digest_date
  route.get(
    "/digest/:digest_date",
    createRateLimiter(60),
    describeRoute({
      tags: TAGS,
      summary: "Digest for a date (YYYY-MM-DD)",
      responses: {
        200: jsonResponse("Digest", digestResponseSchema),
        404: errorResponse("Digest not found"),
      },
    }),
    validator("param", digestDateParamSchema, validationHook),
    async (c) => {
      const { digest_date: digestDate } = c.req.valid("param");
      const digest = await getDigestByDate(db, digestDate);
      if (!digest) {
        return c.json({ detail: "Digest not found" }, 404);
      }
      return c.json(formatDigestResponse(digest));
    },
  );

  return route;
}
