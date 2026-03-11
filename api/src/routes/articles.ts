import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { db } from "../database.js";
import type { Article } from "../db/schema/index.js";
import { verifyApiKey } from "../middleware/auth.js";
import { PG_UNIQUE_VIOLATION, getPgErrorCode } from "../middleware/error-handler.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { validationHook } from "../middleware/validation.js";
import {
  type ArticleDetail,
  type ArticleListItem,
  type ArticleNeighborItem,
  type ArticleNeighborsResponse,
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

const articlesRoute = new Hono<AppEnv>();

// GET /articles/check
articlesRoute.get(
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
articlesRoute.post(
  "/articles",
  createRateLimiter(30),
  verifyApiKey,
  zValidator("json", articleCreateSchema, validationHook),
  async (c) => {
    const data = c.req.valid("json");
    try {
      const article = await createArticle(db, data);
      const detail = formatArticleDetail(article);
      return c.json(detail, 201);
    } catch (err) {
      if (getPgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        return c.json({ detail: "Article with this URL already exists" }, 409);
      }
      throw err;
    }
  },
);

// GET /articles
articlesRoute.get(
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
articlesRoute.get(
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
articlesRoute.get(
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

function formatArticleListItem(
  article: Omit<Article, "bodyOriginal" | "bodyTranslated">,
): ArticleListItem {
  return {
    id: article.id,
    source_url: article.sourceUrl,
    source_name: article.sourceName ?? null,
    title_ja: article.titleJa ?? null,
    summary_ja: article.summaryJa ?? null,
    author: article.author ?? null,
    published_at: article.publishedAt?.toISOString() ?? null,
    og_image_url: article.ogImageUrl ?? null,
    categories: article.categories ?? null,
    created_at: article.createdAt.toISOString(),
  };
}

function formatArticleDetail(article: Article): ArticleDetail {
  return {
    id: article.id,
    source_url: article.sourceUrl,
    source_name: article.sourceName ?? null,
    title_original: article.titleOriginal ?? null,
    title_ja: article.titleJa ?? null,
    body_original: article.bodyOriginal ?? null,
    body_translated: article.bodyTranslated ?? null,
    summary_ja: article.summaryJa ?? null,
    author: article.author ?? null,
    published_at: article.publishedAt?.toISOString() ?? null,
    og_image_url: article.ogImageUrl ?? null,
    categories: article.categories ?? null,
    metadata:
      article.metadata !== null &&
      typeof article.metadata === "object" &&
      !Array.isArray(article.metadata)
        ? (article.metadata as Record<string, unknown>)
        : null,
    created_at: article.createdAt.toISOString(),
  };
}

function formatNeighborItem(neighbor: {
  id: string;
  titleJa: string | null;
  ogImageUrl: string | null;
  publishedAt: Date | null;
}): ArticleNeighborItem {
  return {
    id: neighbor.id,
    title_ja: neighbor.titleJa ?? null,
    og_image_url: neighbor.ogImageUrl ?? null,
    published_at: neighbor.publishedAt?.toISOString() ?? null,
  };
}

function formatNeighborsResponse(neighbors: {
  prev: {
    id: string;
    titleJa: string | null;
    ogImageUrl: string | null;
    publishedAt: Date | null;
  } | null;
  next: {
    id: string;
    titleJa: string | null;
    ogImageUrl: string | null;
    publishedAt: Date | null;
  } | null;
}): ArticleNeighborsResponse {
  return {
    prev: neighbors.prev ? formatNeighborItem(neighbors.prev) : null,
    next: neighbors.next ? formatNeighborItem(neighbors.next) : null,
  };
}

export { articlesRoute };
