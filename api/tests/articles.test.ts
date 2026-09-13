import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { jsonHeaders } from "./helpers.js";
import { getTestDb } from "./setup.js";

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

function buildApp() {
  return createApp(getTestDb());
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
    const res = await app.request("/articles/check?url=https://nonexistent.example.com");
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
    const article1 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/jan15",
      published_at: "2026-01-15T10:00:00Z",
    };
    const article2 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/jan16",
      published_at: "2026-01-16T10:00:00Z",
    };

    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(article1),
    });
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(article2),
    });

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

  it("should include body_original in detail response", async () => {
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
    expect(data).toHaveProperty("body_original", "Original body");
  });

  it("should include body_translated in detail response", async () => {
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
    expect(data).toHaveProperty("body_translated", "翻訳本文");
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
    const articleAi = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/ai-article",
      categories: ["AI", "Startups"],
    };
    const articleHw = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/hw-article",
      categories: ["Hardware"],
    };

    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(articleAi),
    });
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(articleHw),
    });

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
    const article1 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/ai-jan15",
      categories: ["AI"],
      published_at: "2026-01-15T10:00:00Z",
    };
    const article2 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/ai-jan16",
      categories: ["AI"],
      published_at: "2026-01-16T10:00:00Z",
    };
    const article3 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/hw-jan15",
      categories: ["Hardware"],
      published_at: "2026-01-15T10:00:00Z",
    };

    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(article1),
    });
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(article2),
    });
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(article3),
    });

    const res = await app.request("/articles?category=AI&date=2026-01-15");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.items[0].source_url).toBe("https://example.com/ai-jan15");
  });
});

describe("Article Neighbors API", () => {
  it("should return prev and next neighbors", async () => {
    const app = buildApp();
    const a1 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n1",
      published_at: "2026-01-10T10:00:00Z",
    };
    const a2 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n2",
      published_at: "2026-01-11T10:00:00Z",
    };
    const a3 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n3",
      published_at: "2026-01-12T10:00:00Z",
    };

    const r1 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a1),
    });
    const r2 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a2),
    });
    const r3 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a3),
    });
    const { id: id1 } = await r1.json();
    const { id: id2 } = await r2.json();
    const { id: id3 } = await r3.json();

    const res = await app.request(`/articles/${id2}/neighbors`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.prev.id).toBe(id1);
    expect(data.next.id).toBe(id3);
    expect(data.prev.title_ja).toBe(SAMPLE_ARTICLE.title_ja);
  });

  it("should return null next for newest article", async () => {
    const app = buildApp();
    const a1 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n1",
      published_at: "2026-01-10T10:00:00Z",
    };
    const a2 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n2",
      published_at: "2026-01-11T10:00:00Z",
    };

    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a1),
    });
    const r2 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a2),
    });
    const { id: id2 } = await r2.json();

    const res = await app.request(`/articles/${id2}/neighbors`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.prev).not.toBeNull();
    expect(data.next).toBeNull();
  });

  it("should return null prev for oldest article", async () => {
    const app = buildApp();
    const a1 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n1",
      published_at: "2026-01-10T10:00:00Z",
    };
    const a2 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n2",
      published_at: "2026-01-11T10:00:00Z",
    };

    const r1 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a1),
    });
    await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a2),
    });
    const { id: id1 } = await r1.json();

    const res = await app.request(`/articles/${id1}/neighbors`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.prev).toBeNull();
    expect(data.next).not.toBeNull();
  });

  it("should return 404 for non-existent article", async () => {
    const app = buildApp();
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(`/articles/${fakeId}/neighbors`);
    expect(res.status).toBe(404);
  });

  it("should return both null when published_at is null", async () => {
    const app = buildApp();
    const a1 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/n1", published_at: undefined };

    const r1 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a1),
    });
    const { id: id1 } = await r1.json();

    const res = await app.request(`/articles/${id1}/neighbors`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.prev).toBeNull();
    expect(data.next).toBeNull();
  });

  it("should return both null when only one article exists", async () => {
    const app = buildApp();
    const a1 = {
      ...SAMPLE_ARTICLE,
      source_url: "https://example.com/n1",
      published_at: "2026-01-10T10:00:00Z",
    };

    const r1 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a1),
    });
    const { id: id1 } = await r1.json();

    const res = await app.request(`/articles/${id1}/neighbors`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.prev).toBeNull();
    expect(data.next).toBeNull();
  });

  it("should use created_at as tiebreaker for same published_at", async () => {
    const app = buildApp();
    const sameTime = "2026-01-10T10:00:00Z";
    // Articles created in order: a1 first, a2 second, a3 third (all same published_at)
    const a1 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/t1", published_at: sameTime };
    const a2 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/t2", published_at: sameTime };
    const a3 = { ...SAMPLE_ARTICLE, source_url: "https://example.com/t3", published_at: sameTime };

    const r1 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a1),
    });
    const r2 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a2),
    });
    const r3 = await app.request("/articles", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(a3),
    });
    const { id: id1 } = await r1.json();
    const { id: id2 } = await r2.json();
    const { id: id3 } = await r3.json();

    // Middle article (a2) should have a1 as prev and a3 as next
    const res = await app.request(`/articles/${id2}/neighbors`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.prev.id).toBe(id1);
    expect(data.next.id).toBe(id3);
  });
});
