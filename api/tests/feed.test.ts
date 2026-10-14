import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { jsonHeaders } from "./helpers.js";
import { getTestDb } from "./setup.js";

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

function buildApp() {
  return createApp(getTestDb());
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
        body: JSON.stringify({
          ...SAMPLE_ARTICLE,
          source_url: `https://example.com/feed-max-${i}`,
        }),
      });
    }

    const res = await app.request("/feed/rss");
    const text = await res.text();
    const itemCount = (text.match(/<item>/g) || []).length;
    expect(itemCount).toBe(20);
  });
});
