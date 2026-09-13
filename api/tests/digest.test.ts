import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { jsonHeaders } from "./helpers.js";
import { getTestDb } from "./setup.js";

const SAMPLE_DIGEST = {
  digest_date: "2026-01-15",
  title: "2026年1月15日のテックニュースまとめ",
  content: "本日のハイライト...",
  article_count: 10,
  article_ids: [randomUUID(), randomUUID()],
};

function buildApp() {
  return createApp(getTestDb());
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
    await app.request("/digest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_DIGEST),
    });
    const res = await app.request("/digest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_DIGEST),
    });
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
    await app.request("/digest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_DIGEST),
    });

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
