import { describe, it, expect } from "vitest";
import { zValidator } from "@hono/zod-validator";
import { getTestDb } from "./setup.js";
import { createTestApp, jsonHeaders, TEST_API_KEY } from "./helpers.js";
import { verifyApiKey } from "../src/middleware/auth.js";
import { getPgErrorCode } from "../src/middleware/error-handler.js";
import {
  articleCheckQuerySchema,
  articleCreateSchema,
  articleListQuerySchema,
  type ArticleDetail,
  type ArticleListItem,
} from "../src/schemas/article.js";
import {
  checkArticleExists,
  createArticle,
  getArticleById,
  getArticles,
} from "../src/services/article-service.js";

const SAMPLE_ARTICLE = {
  source_url: "https://example.com/article-1",
  source_name: "TechCrunch",
  title_original: "Original Title",
  title_ja: "日本語タイトル",
  body_original: "Original body",
  body_translated: "翻訳本文",
  summary_ja: "日本語要約",
  author: "John Doe",
  published_at: "2026-01-15T10:00:00Z",
  og_image_url: "https://example.com/image.jpg",
  categories: ["AI", "Startups"],
  metadata: { source_feed: "main" },
};

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

function buildApp() {
  const app = createTestApp();
  const db = getTestDb();

  app.get(
    "/articles/check",
    zValidator("query", articleCheckQuerySchema, (result, c) => {
      if (!result.success) return c.json({ detail: "url query parameter is required" }, 422);
    }),
    async (c) => {
      const { url } = c.req.valid("query");
      const exists = await checkArticleExists(db, url);
      return c.json({ exists });
    },
  );

  app.post(
    "/articles",
    verifyApiKey,
    zValidator("json", articleCreateSchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const data = c.req.valid("json");
      try {
        const article = await createArticle(db, data);
        return c.json(formatArticleDetail(article), 201);
      } catch (err) {
        if (getPgErrorCode(err) === "23505") {
          return c.json({ detail: "Article with this URL already exists" }, 409);
        }
        throw err;
      }
    },
  );

  app.get(
    "/articles",
    zValidator("query", articleListQuerySchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const { page, per_page, date, category } = c.req.valid("query");
      if (date) {
        const parsed = new Date(`${date}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime())) {
          return c.json({ detail: `Invalid date: ${date}` }, 400);
        }
      }
      const { items, total } = await getArticles(db, page, per_page, date, category);
      return c.json({ items: items.map(formatArticleListItem), total, page, per_page });
    },
  );

  app.get("/articles/:article_id", async (c) => {
    const articleId = c.req.param("article_id");
    const article = await getArticleById(db, articleId);
    if (!article) return c.json({ detail: "Article not found" }, 404);
    return c.json(formatArticleDetail(article));
  });

  return app;
}

describe("Articles API", () => {
  it("should create an article", async () => {
    const app = buildApp();
    const res = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.source_url).toBe(SAMPLE_ARTICLE.source_url);
    expect(data.title_ja).toBe(SAMPLE_ARTICLE.title_ja);
    expect(data.id).toBeDefined();
  });

  it("should reject duplicate article", async () => {
    const app = buildApp();
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    const res = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.detail).toContain("already exists");
  });

  it("should check article exists", async () => {
    const app = buildApp();
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    const res = await app.request(
      `/articles/check?url=${encodeURIComponent(SAMPLE_ARTICLE.source_url)}`,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exists).toBe(true);
  });

  it("should check article not exists", async () => {
    const app = buildApp();
    const res = await app.request(
      "/articles/check?url=https://nonexistent.example.com",
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exists).toBe(false);
  });

  it("should list articles with pagination", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      const article = { ...SAMPLE_ARTICLE, source_url: `https://example.com/article-${i}` };
      await app.request("/articles", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(article),
      });
    }

    const res = await app.request("/articles?page=1&per_page=2");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(3);
    expect(data.page).toBe(1);
    expect(data.per_page).toBe(2);
    expect(data.items).toHaveLength(2);
  });

  it("should filter articles by date", async () => {
    const app = buildApp();
    const article1 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/jan15", published_at: "2026-01-15T10:00:00Z" };
    const article2 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/jan16", published_at: "2026-01-16T10:00:00Z" };

    await app.request("/articles", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(article1) });
    await app.request("/articles", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(article2) });

    const res = await app.request("/articles?date=2026-01-15");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.items[0].source_url).toBe("https://example.com/jan15");
  });

  it("should get article detail", async () => {
    const app = buildApp();
    const createRes = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    const { id } = await createRes.json();

    const res = await app.request(`/articles/${id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(id);
    expect(data.source_url).toBe(SAMPLE_ARTICLE.source_url);
    expect(data.title_original).toBe(SAMPLE_ARTICLE.title_original);
    expect(data.metadata).toEqual(SAMPLE_ARTICLE.metadata);
  });

  it("should return 404 for non-existent article", async () => {
    const app = buildApp();
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(`/articles/${fakeId}`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toContain("not found");
  });

  it("should exclude body_original from list response", async () => {
    const app = buildApp();
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });

    const res = await app.request("/articles");
    expect(res.status).toBe(200);
    const data = await res.json();
    const item = data.items[0];
    expect(item).not.toHaveProperty("body_original");
  });

  it("should exclude body_original from detail response", async () => {
    const app = buildApp();
    const createRes = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    const { id } = await createRes.json();

    const res = await app.request(`/articles/${id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).not.toHaveProperty("body_original");
  });

  it("should reject without API key", async () => {
    const app = buildApp();
    const res = await app.request("/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    expect(res.status).toBe(401);
  });

  it("should reject with invalid API key", async () => {
    const app = buildApp();
    const res = await app.request("/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": "invalid-key" },
      body: JSON.stringify(SAMPLE_ARTICLE),
    });
    expect(res.status).toBe(401);
  });

  it("should filter articles by category", async () => {
    const app = buildApp();
    const articleAi = { ...SAMPLE_ARTICLE, source_url: "https://example.com/ai-article", categories: ["AI", "Startups"] };
    const articleHw = { ...SAMPLE_ARTICLE, source_url: "https://example.com/hw-article", categories: ["Hardware"] };

    await app.request("/articles", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(articleAi) });
    await app.request("/articles", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(articleHw) });

    const res = await app.request("/articles?category=AI");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.items[0].source_url).toBe("https://example.com/ai-article");
  });

  it("should return empty for no category match", async () => {
    const app = buildApp();
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });

    const res = await app.request("/articles?category=nonexistent");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(0);
    expect(data.items).toHaveLength(0);
  });

  it("should filter by both category and date", async () => {
    const app = buildApp();
    const article1 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/ai-jan15", categories: ["AI"], published_at: "2026-01-15T10:00:00Z" };
    const article2 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/ai-jan16", categories: ["AI"], published_at: "2026-01-16T10:00:00Z" };
    const article3 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/hw-jan15", categories: ["Hardware"], published_at: "2026-01-15T10:00:00Z" };

    await app.request("/articles", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(article1) });
    await app.request("/articles", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(article2) });
    await app.request("/articles", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(article3) });

    const res = await app.request("/articles?category=AI&date=2026-01-15");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.items[0].source_url).toBe("https://example.com/ai-jan15");
  });
});
