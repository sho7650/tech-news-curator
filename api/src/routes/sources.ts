import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { DB } from "../database.js";
import { formatSourceResponse } from "../mappers/source.js";
import { PG_UNIQUE_VIOLATION, getPgErrorCode } from "../middleware/error-handler.js";
import { writeGuard } from "../middleware/guards.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { validationHook } from "../middleware/validation.js";
import { API_KEY_SECURITY, errorResponse, jsonResponse } from "../openapi.js";
import { sourceIdParamSchema } from "../schemas/base.js";
import {
  sourceCreateSchema,
  sourceListQuerySchema,
  sourceListResponseSchema,
  sourceResponseSchema,
  sourceUpdateSchema,
} from "../schemas/source.js";
import {
  createSource,
  deactivateSource,
  getSources,
  updateSource,
} from "../services/source-service.js";
import type { AppEnv } from "../types.js";

const TAGS = ["Sources"];

export function createSourcesRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  // GET /sources
  route.get(
    "/sources",
    createRateLimiter(60),
    describeRoute({
      tags: TAGS,
      summary: "List RSS sources",
      responses: { 200: jsonResponse("Paginated sources", sourceListResponseSchema) },
    }),
    validator("query", sourceListQuerySchema, validationHook),
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
  route.post(
    "/sources",
    ...writeGuard(10),
    describeRoute({
      tags: TAGS,
      summary: "Create an RSS source",
      security: API_KEY_SECURITY,
      responses: {
        201: jsonResponse("Created source", sourceResponseSchema),
        401: errorResponse("Missing or invalid API key"),
        409: errorResponse("A source with this rss_url already exists"),
      },
    }),
    validator("json", sourceCreateSchema, validationHook),
    async (c) => {
      const data = c.req.valid("json");
      try {
        const source = await createSource(db, data);
        return c.json(formatSourceResponse(source), 201);
      } catch (err) {
        if (getPgErrorCode(err) === PG_UNIQUE_VIOLATION) {
          return c.json({ detail: "Source with this RSS URL already exists" }, 409);
        }
        throw err;
      }
    },
  );

  // PUT /sources/:source_id
  route.put(
    "/sources/:source_id",
    ...writeGuard(10),
    describeRoute({
      tags: TAGS,
      summary: "Update a source (partial; null clears a nullable field)",
      security: API_KEY_SECURITY,
      responses: {
        200: jsonResponse("Updated source", sourceResponseSchema),
        401: errorResponse("Missing or invalid API key"),
        404: errorResponse("Source not found"),
        409: errorResponse("A source with this rss_url already exists"),
      },
    }),
    validator("param", sourceIdParamSchema, validationHook),
    validator("json", sourceUpdateSchema, validationHook),
    async (c) => {
      const { source_id: sourceId } = c.req.valid("param");
      const data = c.req.valid("json");
      try {
        const updated = await updateSource(db, sourceId, data);
        if (!updated) {
          return c.json({ detail: "Source not found" }, 404);
        }
        return c.json(formatSourceResponse(updated));
      } catch (err) {
        if (getPgErrorCode(err) === PG_UNIQUE_VIOLATION) {
          return c.json({ detail: "Source with this RSS URL already exists" }, 409);
        }
        throw err;
      }
    },
  );

  // DELETE /sources/:source_id
  route.delete(
    "/sources/:source_id",
    ...writeGuard(10),
    describeRoute({
      tags: TAGS,
      summary: "Deactivate a source (soft delete)",
      security: API_KEY_SECURITY,
      responses: {
        200: jsonResponse("Deactivated source", sourceResponseSchema),
        401: errorResponse("Missing or invalid API key"),
        404: errorResponse("Source not found"),
      },
    }),
    validator("param", sourceIdParamSchema, validationHook),
    async (c) => {
      const { source_id: sourceId } = c.req.valid("param");
      const deactivated = await deactivateSource(db, sourceId);
      if (!deactivated) {
        return c.json({ detail: "Source not found" }, 404);
      }
      return c.json(formatSourceResponse(deactivated));
    },
  );

  return route;
}
