import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb } from "./setup.js";
import {
  checkArticleExists,
  createArticle,
  getArticles,
} from "../src/services/article-service.js";
import type { ArticleCreate } from "../src/schemas/article.js";

function makeArticleData(overrides: Partial<ArticleCreate> = {}): ArticleCreate {
  return {
    source_url: `https://example.com/${randomUUID()}`,
    source_name: "TestSource",
    title_original: "Original Title",
    title_ja: "テストタイトル",
    body_original: "Original body",
    body_translated: "翻訳本文",
    summary_ja: "要約",
    author: "Author",
    published_at: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("Article Service", () => {
  it("should check article exists (true)", async () => {
    const db = getTestDb();
    const data = makeArticleData({ source_url: "https://example.com/exists" });
    await createArticle(db, data);

    const result = await checkArticleExists(db, "https://example.com/exists");
    expect(result).toBe(true);
  });

  it("should check article exists (false)", async () => {
    const db = getTestDb();
    const result = await checkArticleExists(db, "https://example.com/not-exists");
    expect(result).toBe(false);
  });

  it("should create article successfully", async () => {
    const db = getTestDb();
    const data = makeArticleData();
    const article = await createArticle(db, data);

    expect(article.id).toBeDefined();
    expect(article.sourceUrl).toBe(data.source_url);
    expect(article.titleJa).toBe(data.title_ja);
    expect(article.summaryJa).toBe(data.summary_ja);
  });

  it("should reject duplicate URL", async () => {
    const db = getTestDb();
    const url = "https://example.com/duplicate";
    await createArticle(db, makeArticleData({ source_url: url }));

    await expect(createArticle(db, makeArticleData({ source_url: url }))).rejects.toThrow();
  });

  it("should paginate articles", async () => {
    const db = getTestDb();
    for (let i = 0; i < 5; i++) {
      await createArticle(
        db,
        makeArticleData({
          source_url: `https://example.com/page-${i}`,
          published_at: `2026-01-15T${10 + i}:00:00Z`,
        }),
      );
    }

    const { items, total } = await getArticles(db, 1, 2);
    expect(total).toBe(5);
    expect(items).toHaveLength(2);

    const { items: items2, total: total2 } = await getArticles(db, 2, 2);
    expect(total2).toBe(5);
    expect(items2).toHaveLength(2);
  });

  it("should filter by date", async () => {
    const db = getTestDb();
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/jan15",
        published_at: "2026-01-15T10:00:00Z",
      }),
    );
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/jan16",
        published_at: "2026-01-16T10:00:00Z",
      }),
    );

    const { items, total } = await getArticles(db, 1, 20, "2026-01-15");
    expect(total).toBe(1);
    expect(items[0].sourceUrl).toBe("https://example.com/jan15");
  });

  it("should filter by category", async () => {
    const db = getTestDb();
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/ai-article",
        categories: ["ai", "startup"],
      }),
    );
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/hw-article",
        categories: ["hardware"],
      }),
    );

    const { items, total } = await getArticles(db, 1, 20, undefined, "ai");
    expect(total).toBe(1);
    expect(items[0].sourceUrl).toBe("https://example.com/ai-article");
  });

  it("should filter by both category and date", async () => {
    const db = getTestDb();
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/ai-jan15",
        categories: ["ai"],
        published_at: "2026-01-15T10:00:00Z",
      }),
    );
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/ai-jan16",
        categories: ["ai"],
        published_at: "2026-01-16T10:00:00Z",
      }),
    );
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/hw-jan15",
        categories: ["hardware"],
        published_at: "2026-01-15T10:00:00Z",
      }),
    );

    const { items, total } = await getArticles(db, 1, 20, "2026-01-15", "ai");
    expect(total).toBe(1);
    expect(items[0].sourceUrl).toBe("https://example.com/ai-jan15");
  });
});
