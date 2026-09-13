import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ExtractArticle } from "../src/routes/index.js";
import { UnsafeURLError } from "../src/services/url-validator.js";
import { TEST_API_KEY, jsonHeaders } from "./helpers.js";
import { getTestDb } from "./setup.js";

function buildApp(mockExtractArticle: ExtractArticle) {
  return createApp(getTestDb(), { extractArticle: mockExtractArticle });
}

describe("Ingest API", () => {
  it("should extract article successfully", async () => {
    const mock = vi.fn().mockResolvedValue({
      title: "Test Article",
      body: "Article body content",
      author: "Test Author",
      published_at: "2026-01-15",
      og_image_url: "https://example.com/image.jpg",
    });
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "https://example.com/article" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Test Article");
    expect(data.body).toBe("Article body content");
    expect(data.author).toBe("Test Author");
    expect(data.published_at).toBe("2026-01-15");
    expect(data.og_image_url).toBe("https://example.com/image.jpg");
  });

  it("should return 422 on fetch failure", async () => {
    const mock = vi.fn().mockResolvedValue(null);
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "https://invalid.example.com" }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.detail).toContain("Failed to extract");
  });

  it("should return 422 on extraction failure", async () => {
    const mock = vi.fn().mockResolvedValue(null);
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "https://example.com/empty" }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.detail).toContain("Failed to extract");
  });

  it("should return 422 on invalid URL", async () => {
    const mock = vi.fn();
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(res.status).toBe(422);
  });

  it("should return 400 on private IP (SSRF)", async () => {
    const mock = vi.fn().mockRejectedValue(new UnsafeURLError("unsafe"));
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "http://192.168.1.1/article" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detail).toContain("private or reserved");
  });

  it("should return 400 on loopback (SSRF)", async () => {
    const mock = vi.fn().mockRejectedValue(new UnsafeURLError("unsafe"));
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "http://127.0.0.1/secret" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detail).toContain("private or reserved");
  });

  it("should return 400 on link-local (SSRF)", async () => {
    const mock = vi.fn().mockRejectedValue(new UnsafeURLError("unsafe"));
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "http://169.254.169.254/" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detail).toContain("private or reserved");
  });

  it("should reject without API key", async () => {
    const mock = vi.fn();
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/article" }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject with invalid API key", async () => {
    const mock = vi.fn();
    const app = buildApp(mock);

    const res = await app.request("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": "invalid-key" },
      body: JSON.stringify({ url: "https://example.com/article" }),
    });
    expect(res.status).toBe(401);
  });
});
