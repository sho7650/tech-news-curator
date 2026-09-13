import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { DB } from "../database.js";
import { formatSourceResponse } from "../mappers/source.js";
import { PG_UNIQUE_VIOLATION, getPgErrorCode } from "../middleware/error-handler.js";
import { writeGuard } from "../middleware/guards.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { validationHook } from "../middleware/validation.js";
import { sourceIdParamSchema } from "../schemas/base.js";
import {
  sourceCreateSchema,
  sourceListQuerySchema,
  sourceUpdateSchema,
} from "../schemas/source.js";
import {
  createSource,
  deactivateSource,
  getSources,
  updateSource,
} from "../services/source-service.js";
import type { AppEnv } from "../types.js";

export function createSourcesRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  // GET /sources
  route.get(
    "/sources",
    createRateLimiter(60),
    zValidator("query", sourceListQuerySchema, validationHook),
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
    zValidator("json", sourceCreateSchema, validationHook),
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
    zValidator("param", sourceIdParamSchema, validationHook),
    zValidator("json", sourceUpdateSchema, validationHook),
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
    zValidator("param", sourceIdParamSchema, validationHook),
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
