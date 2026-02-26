import { describe, it, expect, vi } from "vitest";
import { createTestApp, jsonHeaders, TEST_API_KEY } from "./helpers.js";
import { verifyApiKey } from "../src/middleware/auth.js";
import { zValidator } from "@hono/zod-validator";
import { ingestRequestSchema } from "../src/schemas/ingest.js";
import { UnsafeURLError } from "../src/services/url-validator.js";

function buildApp(mockExtractArticle: any) {
  const app = createTestApp();

  app.post(
    "/ingest",
    verifyApiKey,
    zValidator("json", ingestRequestSchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const { url } = c.req.valid("json");
      try {
        const result = await mockExtractArticle(url);
        if (!result) {
          return c.json({ detail: "Failed to extract content from URL" }, 422);
        }
        return c.json(result);
      } catch (err) {
        if (err instanceof UnsafeURLError) {
          return c.json({ detail: "URL points to a private or reserved address" }, 400);
        }
        throw err;
      }
    },
  );

  return app;
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
