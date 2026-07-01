import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { getTestDb } from "./setup.js";
import { createTestApp } from "./helpers.js";
import { articles } from "../src/db/schema/index.js";
import { jstYesterday } from "../src/lib/jst-date.js";
import {
  digestSourceQuerySchema,
  type DigestSourceArticle,
  type DigestSourceResponse,
} from "../src/schemas/digest.js";
import {
  DIGEST_SOURCE_MAX,
  getArticlesForDigest,
  type DigestSourceRow,
} from "../src/services/article-service.js";

interface SeedOverrides {
  createdAt: Date;
  bodyTranslated?: string | null;
  bodyOriginal?: string | null;
  summaryJa?: string | null;
}

async function seedArticle(overrides: SeedOverrides) {
  const db = getTestDb();
  const [row] = await db
    .insert(articles)
    .values({
      sourceUrl: `https://example.com/${randomUUID()}`,
      sourceName: "TestSource",
      titleOriginal: "Original Title",
      titleJa: "テストタイトル",
      bodyOriginal: overrides.bodyOriginal ?? "Original body",
      bodyTranslated: overrides.bodyTranslated ?? "翻訳本文",
      summaryJa: overrides.summaryJa ?? "要約",
      author: "Author",
      publishedAt: overrides.createdAt,
      categories: ["tech"],
      createdAt: overrides.createdAt,
    })
    .returning();
  return row;
}

// Rebuild the route wired to the test DB (mirrors the real handler in routes/digest.ts).
function formatDigestSourceArticle(row: DigestSourceRow): DigestSourceArticle {
  return {
    id: row.id,
    source_url: row.sourceUrl,
    source_name: row.sourceName ?? null,
    title_original: row.titleOriginal ?? null,
    title_ja: row.titleJa ?? null,
    summary_ja: row.summaryJa ?? null,
    body_translated: row.bodyTranslated ?? null,
    author: row.author ?? null,
    published_at: row.publishedAt?.toISOString() ?? null,
    categories: row.categories ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

function buildApp() {
  const app = createTestApp();
  const db = getTestDb();
  app.get(
    "/digest/source-articles",
    zValidator("query", digestSourceQuerySchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const { date } = c.req.valid("query");
      const targetDate = date ?? jstYesterday(new Date());
      const { items, truncated } = await getArticlesForDigest(db, targetDate);
      const response: DigestSourceResponse = {
        date: targetDate,
        count: items.length,
        truncated,
        articles: items.map(formatDigestSourceArticle),
      };
      return c.json(response);
    },
  );
  return app;
}

describe("getArticlesForDigest (service)", () => {
  it("returns articles whose created_at falls within the JST day", async () => {
    const db = getTestDb();
    // JST 2026-06-19 00:30 == UTC 2026-06-18 15:30 -> belongs to 2026-06-19
    const inDay = await seedArticle({ createdAt: new Date("2026-06-18T15:30:00Z") });

    const { items, truncated } = await getArticlesForDigest(db, "2026-06-19");

    expect(truncated).toBe(false);
    expect(items.map((i) => i.id)).toEqual([inDay.id]);
  });

  it("excludes articles from the previous and next JST day at the boundary", async () => {
    const db = getTestDb();
    // JST 2026-06-18 23:30 == UTC 2026-06-18 14:30 -> belongs to 2026-06-18 (excluded)
    await seedArticle({ createdAt: new Date("2026-06-18T14:30:00Z") });
    // JST 2026-06-20 00:30 == UTC 2026-06-19 15:30 -> belongs to 2026-06-20 (excluded)
    await seedArticle({ createdAt: new Date("2026-06-19T15:30:00Z") });
    // Inside 2026-06-19
    const inDay = await seedArticle({ createdAt: new Date("2026-06-19T03:00:00Z") });

    const { items } = await getArticlesForDigest(db, "2026-06-19");

    expect(items.map((i) => i.id)).toEqual([inDay.id]);
  });

  it("includes summary_ja and body_translated but never selects body_original", async () => {
    const db = getTestDb();
    await seedArticle({
      createdAt: new Date("2026-06-19T03:00:00Z"),
      bodyTranslated: "日本語の本文",
      summaryJa: "日本語の要約",
      bodyOriginal: "SHOULD_NOT_LEAK",
    });

    const { items } = await getArticlesForDigest(db, "2026-06-19");

    expect(items[0].bodyTranslated).toBe("日本語の本文");
    expect(items[0].summaryJa).toBe("日本語の要約");
    expect(items[0]).not.toHaveProperty("bodyOriginal");
  });

  it("orders results by created_at descending", async () => {
    const db = getTestDb();
    const older = await seedArticle({ createdAt: new Date("2026-06-19T01:00:00Z") });
    const newer = await seedArticle({ createdAt: new Date("2026-06-19T05:00:00Z") });

    const { items } = await getArticlesForDigest(db, "2026-06-19");

    expect(items.map((i) => i.id)).toEqual([newer.id, older.id]);
  });

  it("returns an empty result for a day with no articles", async () => {
    const db = getTestDb();
    const { items, truncated } = await getArticlesForDigest(db, "2026-06-19");
    expect(items).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("caps results at the limit and flags truncation", async () => {
    const db = getTestDb();
    for (let i = 0; i < 5; i++) {
      await seedArticle({ createdAt: new Date(`2026-06-19T0${i}:00:00Z`) });
    }

    const { items, truncated } = await getArticlesForDigest(db, "2026-06-19", 3);

    expect(items).toHaveLength(3);
    expect(truncated).toBe(true);
  });

  it("exposes a sane default cap", () => {
    expect(DIGEST_SOURCE_MAX).toBeGreaterThanOrEqual(100);
  });
});

describe("GET /digest/source-articles (route)", () => {
  it("returns the digest source envelope for an explicit date", async () => {
    await seedArticle({ createdAt: new Date("2026-06-19T03:00:00Z") });
    const app = buildApp();

    const res = await app.request("/digest/source-articles?date=2026-06-19");
    expect(res.status).toBe(200);

    const body = (await res.json()) as DigestSourceResponse;
    expect(body.date).toBe("2026-06-19");
    expect(body.count).toBe(1);
    expect(body.truncated).toBe(false);
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].id).toBeDefined();
    expect(body.articles[0].body_translated).toBe("翻訳本文");
    expect(body.articles[0]).not.toHaveProperty("body_original");
  });

  it("defaults to the JST previous day when no date is provided", async () => {
    const expected = jstYesterday(new Date());
    const app = buildApp();

    const res = await app.request("/digest/source-articles");
    expect(res.status).toBe(200);

    const body = (await res.json()) as DigestSourceResponse;
    expect(body.date).toBe(expected);
  });

  it("rejects an invalid date with 422", async () => {
    const app = buildApp();
    const res = await app.request("/digest/source-articles?date=2026-13-40");
    expect(res.status).toBe(422);
  });
});
