import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb } from "./setup.js";
import { createArticle } from "../src/services/article-service.js";
import { generateRssFeed } from "../src/services/rss-service.js";
import type { ArticleCreate } from "../src/schemas/article.js";

function makeArticleData(overrides: Partial<ArticleCreate> = {}): ArticleCreate {
  return {
    source_url: `https://example.com/${randomUUID()}`,
    source_name: "TestSource",
    title_original: "Original Title",
    title_ja: "テストタイトル",
    body_original: "Original body",
    body_translated: "翻訳本文",
    summary_ja: "テスト要約",
    author: "Author",
    published_at: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("RSS Service", () => {
  it("should generate empty feed", async () => {
    const db = getTestDb();
    const xml = await generateRssFeed(db);
    expect(xml).toContain("<?xml");
    expect(xml).toContain("<rss");
    expect(xml).toContain("Tech News Curator");
  });

  it("should generate feed with entries", async () => {
    const db = getTestDb();
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/rss-test",
        title_ja: "RSSテスト記事",
        summary_ja: "RSSテスト要約",
      }),
    );

    const xml = await generateRssFeed(db);
    expect(xml).toContain("<item>");
    expect(xml).toContain("RSSテスト記事");
    expect(xml).toContain("RSSテスト要約");
  });

  it("should encode UTF-8 correctly", async () => {
    const db = getTestDb();
    await createArticle(
      db,
      makeArticleData({
        source_url: "https://example.com/encoding-test",
        title_ja: "日本語テスト",
        summary_ja: "日本語要約テスト",
      }),
    );

    const xml = await generateRssFeed(db);
    expect(xml).toContain("日本語テスト");
    expect(xml).toContain("日本語要約テスト");
  });
});
