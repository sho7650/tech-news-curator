import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { jsonHeaders } from "./helpers.js";
import { getTestDb } from "./setup.js";

const SAMPLE_SOURCE = {
  name: "TechCrunch",
  rss_url: "https://techcrunch.com/feed/",
  site_url: "https://techcrunch.com",
  category: "general",
};

function buildApp() {
  return createApp(getTestDb());
}

describe("Sources API", () => {
  it("should create a source", async () => {
    const app = buildApp();
    const res = await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_SOURCE),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe(SAMPLE_SOURCE.name);
    expect(data.rss_url).toBe(SAMPLE_SOURCE.rss_url);
    expect(data.is_active).toBe(true);
    expect(data.id).toBeDefined();
  });

  it("should reject duplicate source", async () => {
    const app = buildApp();
    await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_SOURCE),
    });
    const res = await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_SOURCE),
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.detail).toContain("already exists");
  });

  it("should reject without API key", async () => {
    const app = buildApp();
    const res = await app.request("/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SAMPLE_SOURCE),
    });
    expect(res.status).toBe(401);
  });

  it("should list sources", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      await app.request("/sources", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          ...SAMPLE_SOURCE,
          rss_url: `https://example.com/feed/${i}`,
          name: `Source ${i}`,
        }),
      });
    }
    const res = await app.request("/sources");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(3);
    expect(data.items).toHaveLength(3);
  });

  it("should filter active only", async () => {
    const app = buildApp();
    await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/active" }),
    });
    const res2 = await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/inactive" }),
    });
    const source2Id = (await res2.json()).id;
    await app.request(`/sources/${source2Id}`, { method: "DELETE", headers: jsonHeaders() });

    const res = await app.request("/sources?active_only=true");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
  });

  it("should paginate sources", async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      await app.request("/sources", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          ...SAMPLE_SOURCE,
          rss_url: `https://example.com/feed/page-${i}`,
          name: `Source ${i}`,
        }),
      });
    }
    const res = await app.request("/sources?page=1&per_page=2");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(5);
    expect(data.page).toBe(1);
    expect(data.per_page).toBe(2);
    expect(data.items).toHaveLength(2);
  });

  it("should update source", async () => {
    const app = buildApp();
    const createRes = await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_SOURCE),
    });
    const { id } = await createRes.json();

    const res = await app.request(`/sources/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: "Updated Name" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated Name");
    expect(data.rss_url).toBe(SAMPLE_SOURCE.rss_url);
  });

  it("should return 404 for updating non-existent source", async () => {
    const app = buildApp();
    const res = await app.request("/sources/00000000-0000-0000-0000-000000000000", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toContain("not found");
  });

  it("should reject updating to duplicate rss_url", async () => {
    const app = buildApp();
    await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/first" }),
    });
    const createRes2 = await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/second" }),
    });
    const { id: source2Id } = await createRes2.json();

    const res = await app.request(`/sources/${source2Id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ rss_url: "https://example.com/feed/first" }),
    });
    expect(res.status).toBe(409);
  });

  it("should delete (deactivate) source", async () => {
    const app = buildApp();
    const createRes = await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_SOURCE),
    });
    const { id } = await createRes.json();

    const res = await app.request(`/sources/${id}`, { method: "DELETE", headers: jsonHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.is_active).toBe(false);
  });

  it("should return 404 for deleting non-existent source", async () => {
    const app = buildApp();
    const res = await app.request("/sources/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
      headers: jsonHeaders(),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.detail).toContain("not found");
  });

  it("should verify deactivation via list", async () => {
    const app = buildApp();
    const createRes = await app.request("/sources", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(SAMPLE_SOURCE),
    });
    const { id } = await createRes.json();

    await app.request(`/sources/${id}`, { method: "DELETE", headers: jsonHeaders() });

    const res = await app.request("/sources");
    const data = await res.json();
    const source = data.items.find((s: any) => s.id === id);
    expect(source.is_active).toBe(false);
  });
});
