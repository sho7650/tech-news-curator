import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { db } from "../database.js";
import { verifyApiKey } from "../middleware/auth.js";
import { getPgErrorCode } from "../middleware/error-handler.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import {
  type ArticleDetail,
  type ArticleListItem,
  articleCheckQuerySchema,
  articleCreateSchema,
  articleListQuerySchema,
} from "../schemas/article.js";
import {
  checkArticleExists,
  createArticle,
  getArticleById,
  getArticles,
} from "../services/article-service.js";

const articlesRoute = new Hono();

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
  zValidator("json", articleCreateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
  async (c) => {
    const data = c.req.valid("json");
    try {
      const article = await createArticle(db, data);
      const detail = formatArticleDetail(article);
      return c.json(detail, 201);
    } catch (err) {
      if (getPgErrorCode(err) === "23505") {
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
  zValidator("query", articleListQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: result.error.errors }, 422);
    }
  }),
  async (c) => {
    const { page, per_page, date, category } = c.req.valid("query");

    // Validate date if provided
    if (date) {
      const parsed = new Date(`${date}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        return c.json({ detail: `Invalid date: ${date}` }, 400);
      }
    }

    const { items, total } = await getArticles(db, page, per_page, date, category);
    return c.json({
      items: items.map(formatArticleListItem),
      total,
      page,
      per_page,
    });
  },
);

// GET /articles/:article_id
articlesRoute.get("/articles/:article_id", createRateLimiter(200), async (c) => {
  const articleId = c.req.param("article_id");
  const article = await getArticleById(db, articleId);
  if (!article) {
    return c.json({ detail: "Article not found" }, 404);
  }
  return c.json(formatArticleDetail(article));
});

function formatArticleListItem(article: any): ArticleListItem {
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

function formatArticleDetail(article: any): ArticleDetail {
  return {
    id: article.id,
    source_url: article.sourceUrl,
    source_name: article.sourceName ?? null,
    title_original: article.titleOriginal ?? null,
    title_ja: article.titleJa ?? null,
    body_translated: article.bodyTranslated ?? null,
    summary_ja: article.summaryJa ?? null,
    author: article.author ?? null,
    published_at: article.publishedAt?.toISOString() ?? null,
    og_image_url: article.ogImageUrl ?? null,
    categories: article.categories ?? null,
    metadata: article.metadata ?? null,
    created_at: article.createdAt.toISOString(),
  };
}

export { articlesRoute };
