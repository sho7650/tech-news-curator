import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { db } from "../database.js";
import { verifyApiKey } from "../middleware/auth.js";
import { getPgErrorCode } from "../middleware/error-handler.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import {
  type SourceResponse,
  sourceCreateSchema,
  sourceListQuerySchema,
  sourceUpdateSchema,
} from "../schemas/source.js";
import {
  createSource,
  deactivateSource,
  getSourceById,
  getSources,
  updateSource,
} from "../services/source-service.js";

const sourcesRoute = new Hono();

// GET /sources
sourcesRoute.get(
  "/sources",
  createRateLimiter(60),
  zValidator("query", sourceListQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
  async (c) => {
    const { page, per_page, active_only } = c.req.valid("query");
    const { items, total } = await getSources(db, page, per_page, active_only);
    return c.json({
      items: items.map(formatSourceResponse),
      total,
      page,
      per_page,
    });
  },
);

// POST /sources
sourcesRoute.post(
  "/sources",
  createRateLimiter(10),
  verifyApiKey,
  zValidator("json", sourceCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
  async (c) => {
    const data = c.req.valid("json");
    try {
      const source = await createSource(db, data);
      return c.json(formatSourceResponse(source), 201);
    } catch (err) {
      if (getPgErrorCode(err) === "23505") {
        return c.json({ detail: "Source with this RSS URL already exists" }, 409);
      }
      throw err;
    }
  },
);

// PUT /sources/:source_id
sourcesRoute.put(
  "/sources/:source_id",
  createRateLimiter(10),
  verifyApiKey,
  zValidator("json", sourceUpdateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
  async (c) => {
    const sourceId = c.req.param("source_id");
    const existing = await getSourceById(db, sourceId);
    if (!existing) {
      return c.json({ detail: "Source not found" }, 404);
    }
    const data = c.req.valid("json");
    try {
      const updated = await updateSource(db, sourceId, data);
      return c.json(formatSourceResponse(updated!));
    } catch (err) {
      if (getPgErrorCode(err) === "23505") {
        return c.json({ detail: "Source with this RSS URL already exists" }, 409);
      }
      throw err;
    }
  },
);

// DELETE /sources/:source_id
sourcesRoute.delete("/sources/:source_id", createRateLimiter(10), verifyApiKey, async (c) => {
  const sourceId = c.req.param("source_id");
  const existing = await getSourceById(db, sourceId);
  if (!existing) {
    return c.json({ detail: "Source not found" }, 404);
  }
  const deactivated = await deactivateSource(db, sourceId);
  return c.json(formatSourceResponse(deactivated));
});

function formatSourceResponse(source: any): SourceResponse {
  return {
    id: source.id,
    name: source.name ?? null,
    rss_url: source.rssUrl,
    site_url: source.siteUrl ?? null,
    category: source.category ?? null,
    is_active: source.isActive,
    created_at: source.createdAt.toISOString(),
  };
}

export { sourcesRoute };
