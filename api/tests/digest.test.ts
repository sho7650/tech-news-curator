import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { getTestDb } from "./setup.js";
import { createTestApp, jsonHeaders, TEST_API_KEY } from "./helpers.js";
import { verifyApiKey } from "../src/middleware/auth.js";
import { getPgErrorCode } from "../src/middleware/error-handler.js";
import { digestCreateSchema, digestListQuerySchema, type DigestResponse, type DigestListItem } from "../src/schemas/digest.js";
import { createDigest, getDigestByDate, getDigests } from "../src/services/digest-service.js";

const SAMPLE_DIGEST = {
  digest_date: "2026-01-15",
  title: "2026年1月15日のテックニュースまとめ",
  content: "本日のハイライト...",
  article_count: 10,
  article_ids: [randomUUID(), randomUUID()],
};

function formatDigestResponse(digest: any): DigestResponse {
  return {
    id: digest.id,
    digest_date: digest.digestDate,
    title: digest.title ?? null,
    content: digest.content ?? null,
    article_count: digest.articleCount ?? null,
    article_ids: digest.articleIds ?? null,
    created_at: digest.createdAt.toISOString(),
  };
}

function formatDigestListItem(digest: any): DigestListItem {
  return {
    id: digest.id,
    digest_date: digest.digestDate,
    title: digest.title ?? null,
    article_count: digest.articleCount ?? null,
    created_at: digest.createdAt.toISOString(),
  };
}

function buildApp() {
  const app = createTestApp();
  const db = getTestDb();

  app.post(
    "/digest",
    verifyApiKey,
    zValidator("json", digestCreateSchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const data = c.req.valid("json");
      try {
        const digest = await createDigest(db, data);
        return c.json(formatDigestResponse(digest), 201);
      } catch (err) {
        if (getPgErrorCode(err) === "23505") {
          return c.json({ detail: "Digest for this date already exists" }, 409);
        }
        throw err;
      }
    },
  );

  app.get(
    "/digest",
    zValidator("query", digestListQuerySchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const { page, per_page } = c.req.valid("query");
      const { items, total } = await getDigests(db, page, per_page);
      return c.json({ items: items.map(formatDigestListItem), total, page, per_page });
    },
  );

  app.get("/digest/:digest_date", async (c) => {
    const digestDate = c.req.param("digest_date");
    const digest = await getDigestByDate(db, digestDate);
    if (!digest) return c.json({ detail: "Digest not found" }, 404);
    return c.json(formatDigestResponse(digest));
  });

  return app;
}

describe("Digest API", () => {
  it("should create a digest", async () => {
    const app = buildApp();
    const res = await app.request("/digest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_DIGEST),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.digest_date).toBe(SAMPLE_DIGEST.digest_date);
    expect(data.title).toBe(SAMPLE_DIGEST.title);
    expect(data.id).toBeDefined();
  });

  it("should reject duplicate date", async () => {
    const app = buildApp();
    await app.request("/digest", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_DIGEST) });
    const res = await app.request("/digest", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_DIGEST) });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.detail).toContain("already exists");
  });

  it("should list digests", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      await app.request("/digest", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ ...SAMPLE_DIGEST, digest_date: `2026-01-${15 + i}` }),
      });
    }
    const res = await app.request("/digest");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(3);
    expect(data.page).toBe(1);
    expect(data.per_page).toBe(20);
    expect(data.items).toHaveLength(3);
    // Should be sorted by date descending
    expect(data.items[0].digest_date).toBe("2026-01-17");
  });

  it("should get digest by date", async () => {
    const app = buildApp();
    await app.request("/digest", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_DIGEST) });

    const res = await app.request("/digest/2026-01-15");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.digest_date).toBe("2026-01-15");
    expect(data.content).toBe(SAMPLE_DIGEST.content);
  });

  it("should return 404 for non-existent digest", async () => {
    const app = buildApp();
    const res = await app.request("/digest/2099-12-31");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toContain("not found");
  });

  it("should reject without API key", async () => {
    const app = buildApp();
    const res = await app.request("/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SAMPLE_DIGEST),
    });
    expect(res.status).toBe(401);
  });

  it("should reject with invalid API key", async () => {
    const app = buildApp();
    const res = await app.request("/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": "invalid-key" },
      body: JSON.stringify(SAMPLE_DIGEST),
    });
    expect(res.status).toBe(401);
  });
});
