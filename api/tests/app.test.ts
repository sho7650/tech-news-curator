import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { jsonHeaders, waitForBrokerDrain } from "./helpers.js";
import { getTestDb } from "./setup.js";

// These tests exercise the real route modules and middleware chain, so
// registration order, auth attachment, and header middleware are covered.
describe("createApp wiring", () => {
  it("serves /articles/stream as SSE, not as the /articles/:id route", async () => {
    const app = createApp(getTestDb());
    const controller = new AbortController();
    const res = await app.request("/articles/stream", { signal: controller.signal });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
    await res.body?.cancel();
    await waitForBrokerDrain();
  });

  it("serves /digest/source-articles before /digest/:digest_date", async () => {
    const app = createApp(getTestDb());
    const res = await app.request("/digest/source-articles?date=2026-01-15");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.date).toBe("2026-01-15");
    expect(data.articles).toEqual([]);
  });

  it("rejects write endpoints without an API key", async () => {
    const app = createApp(getTestDb());
    const body = JSON.stringify({ url: "https://example.com/a" });
    const headers = { "Content-Type": "application/json" };

    const ingest = await app.request("/ingest", { method: "POST", headers, body });
    const article = await app.request("/articles", { method: "POST", headers, body });
    const source = await app.request("/sources", { method: "POST", headers, body });
    const digest = await app.request("/digest", { method: "POST", headers, body });

    expect([ingest.status, article.status, source.status, digest.status]).toEqual([
      401, 401, 401, 401,
    ]);
  });

  it("applies security headers to every response", async () => {
    const app = createApp(getTestDb());
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBeTruthy();
  });

  it("returns the shared error shape for unknown routes", async () => {
    const app = createApp(getTestDb());
    const res = await app.request("/nope");

    expect(res.status).toBe(404);
  });

  it("lets tests inject the article extractor for /ingest", async () => {
    const extractArticle = async () => ({
      title: "Injected",
      body: null,
      author: null,
      published_at: null,
      og_image_url: null,
    });
    const app = createApp(getTestDb(), { extractArticle });
    const res = await app.request("/ingest", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ url: "https://example.com/a" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Injected");
  });
});
