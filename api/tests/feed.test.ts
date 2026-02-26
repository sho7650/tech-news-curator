import { describe, it, expect } from "vitest";
import { zValidator } from "@hono/zod-validator";
import { getTestDb } from "./setup.js";
import { createTestApp, jsonHeaders } from "./helpers.js";
import { verifyApiKey } from "../src/middleware/auth.js";
import { getPgErrorCode } from "../src/middleware/error-handler.js";
import { articleCreateSchema, type ArticleDetail } from "../src/schemas/article.js";
import { createArticle } from "../src/services/article-service.js";
import { generateRssFeed } from "../src/services/rss-service.js";

const SAMPLE_ARTICLE = {
  source_url: "https://example.com/feed-test",
  source_name: "TechCrunch",
  title_original: "Original Title",
  title_ja: "日本語タイトル",
  body_original: "Original body",
  body_translated: "翻訳本文",
  summary_ja: "日本語要約",
  author: "John Doe",
  published_at: "2026-01-15T10:00:00Z",
  categories: ["AI"],
};

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

  app.get("/feed/rss", async (c) => {
    const rssXml = await generateRssFeed(db);
    return new Response(rssXml, {
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  });

  return app;
}

describe("RSS Feed API", () => {
  it("should return empty feed", async () => {
    const app = buildApp();
    const res = await app.request("/feed/rss");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("<rss");
    expect(text).not.toContain("<item>");
  });

  it("should return feed with articles", async () => {
    const app = buildApp();
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });

    const res = await app.request("/feed/rss");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("<rss");
    expect(text).toContain("<item>");
    expect(text).toContain("日本語タイトル");
    expect(text).toContain("日本語要約");
  });

  it("should set correct content type", async () => {
    const app = buildApp();
    const res = await app.request("/feed/rss");
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
  });

  it("should exclude body from feed", async () => {
    const app = buildApp();
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_ARTICLE),
    });

    const res = await app.request("/feed/rss");
    const text = await res.text();
    expect(text).not.toContain("Original body");
    expect(text).not.toContain("翻訳本文");
  });

  it("should limit to 20 items", async () => {
    const app = buildApp();
    for (let i = 0; i < 25; i++) {
      await app.request("/articles", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ ...SAMPLE_ARTICLE, source_url: `https://example.com/feed-max-${i}` }),
      });
    }

    const res = await app.request("/feed/rss");
    const text = await res.text();
    const itemCount = (text.match(/<item>/g) || []).length;
    expect(itemCount).toBe(20);
  });
});
