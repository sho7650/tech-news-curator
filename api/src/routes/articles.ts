import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { DB } from "../database.js";
import {
  formatArticleDetail,
  formatArticleListItem,
  formatNeighborsResponse,
} from "../mappers/article.js";
import { PG_UNIQUE_VIOLATION, getPgErrorCode } from "../middleware/error-handler.js";
import { writeGuard } from "../middleware/guards.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { validationHook } from "../middleware/validation.js";
import {
  articleCheckQuerySchema,
  articleCreateSchema,
  articleListQuerySchema,
} from "../schemas/article.js";
import { uuidParamSchema } from "../schemas/base.js";
import {
  checkArticleExists,
  createArticle,
  getArticleById,
  getArticleNeighbors,
  getArticles,
} from "../services/article-service.js";
import type { AppEnv } from "../types.js";

export function createArticlesRoute(db: DB): Hono<AppEnv> {
  const route = new Hono<AppEnv>();

  // GET /articles/check
  route.get(
    "/articles/check",
    createRateLimiter(100),
    zValidator("query", articleCheckQuerySchema, (result, c) => {
      if (!result.success) {
        return c.json({ detail: "url query parameter is required" }, 422);
      }
    }),
    async (c) => {
      const { url } = c.req.valid("query");
      const exists = await checkArticleExists(db, url);
      return c.json({ exists });
    },
  );

  // POST /articles
  route.post(
    "/articles",
    ...writeGuard(30),
    zValidator("json", articleCreateSchema, validationHook),
    async (c) => {
      const data = c.req.valid("json");
      try {
        const article = await createArticle(db, data);
        return c.json(formatArticleDetail(article), 201);
      } catch (err) {
        if (getPgErrorCode(err) === PG_UNIQUE_VIOLATION) {
          return c.json({ detail: "Article with this URL already exists" }, 409);
        }
        throw err;
      }
    },
  );

  // GET /articles
  route.get(
    "/articles",
    createRateLimiter(200),
    zValidator("query", articleListQuerySchema, validationHook),
    async (c) => {
      const { page, per_page, date, category } = c.req.valid("query");
      const { items, total } = await getArticles(db, page, per_page, date, category);
      return c.json({
        items: items.map(formatArticleListItem),
        total,
        page,
        per_page,
      });
    },
  );

  // GET /articles/:article_id/neighbors
  route.get(
    "/articles/:article_id/neighbors",
    createRateLimiter(200),
    zValidator("param", uuidParamSchema, validationHook),
    async (c) => {
      const { article_id: articleId } = c.req.valid("param");
      const neighbors = await getArticleNeighbors(db, articleId);
      if (!neighbors) {
        return c.json({ detail: "Article not found" }, 404);
      }
      return c.json(formatNeighborsResponse(neighbors));
    },
  );

  // GET /articles/:article_id
  route.get(
    "/articles/:article_id",
    createRateLimiter(200),
    zValidator("param", uuidParamSchema, validationHook),
    async (c) => {
      const { article_id: articleId } = c.req.valid("param");
      const article = await getArticleById(db, articleId);
      if (!article) {
        return c.json({ detail: "Article not found" }, 404);
      }
      return c.json(formatArticleDetail(article));
    },
  );

  return route;
}
