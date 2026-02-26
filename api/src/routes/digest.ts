import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { db } from "../database.js";
import { verifyApiKey } from "../middleware/auth.js";
import { getPgErrorCode } from "../middleware/error-handler.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import {
  type DigestListItem,
  type DigestResponse,
  digestCreateSchema,
  digestListQuerySchema,
} from "../schemas/digest.js";
import { createDigest, getDigestByDate, getDigests } from "../services/digest-service.js";

const digestRoute = new Hono();

// POST /digest
digestRoute.post(
  "/digest",
  createRateLimiter(5),
  verifyApiKey,
  zValidator("json", digestCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
  async (c) => {
    const data = c.req.valid("json");
    try {
      const digest = await createDigest(db, data);
      return c.json(formatDigestResponse(digest), 201);
    } catch (err) {
      if (getPgErrorCode(err) === "23505") {
        return c.json({ detail: "Digest for this date already exists" }, 409);
      }
      throw err;
    }
  },
);

// GET /digest
digestRoute.get(
  "/digest",
  createRateLimiter(60),
  zValidator("query", digestListQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
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

// GET /digest/:digest_date
digestRoute.get("/digest/:digest_date", createRateLimiter(60), async (c) => {
  const digestDate = c.req.param("digest_date");
  const digest = await getDigestByDate(db, digestDate);
  if (!digest) {
    return c.json({ detail: "Digest not found" }, 404);
  }
  return c.json(formatDigestResponse(digest));
});

function formatDigestResponse(digest: any): DigestResponse {
  return {
    id: digest.id,
    digest_date: digest.digestDate,
    title: digest.title ?? null,
    content: digest.content ?? null,
    article_count: digest.articleCount ?? null,
    article_ids: digest.articleIds ?? null,
    created_at: digest.createdAt.toISOString(),
  };
}

function formatDigestListItem(digest: any): DigestListItem {
  return {
    id: digest.id,
    digest_date: digest.digestDate,
    title: digest.title ?? null,
    article_count: digest.articleCount ?? null,
    created_at: digest.createdAt.toISOString(),
  };
}

export { digestRoute };
