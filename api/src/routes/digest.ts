import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
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
import { digestDateParamSchema } from "../schemas/base.js";
import {
  type DigestSourceResponse,
  digestCreateSchema,
  digestListQuerySchema,
  digestSourceQuerySchema,
} from "../schemas/digest.js";
import { getArticlesForDigest } from "../services/article-service.js";
import { createDigest, getDigestByDate, getDigests } from "../services/digest-service.js";
import type { AppEnv } from "../types.js";

export function createDigestRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  // POST /digest
  route.post(
    "/digest",
    ...writeGuard(5),
    zValidator("json", digestCreateSchema, validationHook),
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
    zValidator("query", digestListQuerySchema, validationHook),
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
    zValidator("query", digestSourceQuerySchema, validationHook),
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
    zValidator("param", digestDateParamSchema, validationHook),
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
