import { describe, it, expect } from "vitest";
import { zValidator } from "@hono/zod-validator";
import { getTestDb } from "./setup.js";
import { createTestApp, jsonHeaders, TEST_API_KEY } from "./helpers.js";
import { verifyApiKey } from "../src/middleware/auth.js";
import { getPgErrorCode } from "../src/middleware/error-handler.js";
import {
  sourceCreateSchema,
  sourceListQuerySchema,
  sourceUpdateSchema,
  type SourceResponse,
} from "../src/schemas/source.js";
import {
  createSource,
  deactivateSource,
  getSourceById,
  getSources,
  updateSource,
} from "../src/services/source-service.js";

const SAMPLE_SOURCE = {
  name: "TechCrunch",
  rss_url: "https://techcrunch.com/feed/",
  site_url: "https://techcrunch.com",
  category: "general",
};

function formatSourceResponse(source: any): SourceResponse {
  return {
    id: source.id,
    name: source.name ?? null,
    rss_url: source.rssUrl,
    site_url: source.siteUrl ?? null,
    category: source.category ?? null,
    is_active: source.isActive,
    created_at: source.createdAt.toISOString(),
  };
}

function buildApp() {
  const app = createTestApp();
  const db = getTestDb();

  app.get(
    "/sources",
    zValidator("query", sourceListQuerySchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const { page, per_page, active_only } = c.req.valid("query");
      const { items, total } = await getSources(db, page, per_page, active_only);
      return c.json({ items: items.map(formatSourceResponse), total, page, per_page });
    },
  );

  app.post(
    "/sources",
    verifyApiKey,
    zValidator("json", sourceCreateSchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const data = c.req.valid("json");
      try {
        const source = await createSource(db, data);
        return c.json(formatSourceResponse(source), 201);
      } catch (err) {
        if (getPgErrorCode(err) === "23505") {
          return c.json({ detail: "Source with this RSS URL already exists" }, 409);
        }
        throw err;
      }
    },
  );

  app.put(
    "/sources/:source_id",
    verifyApiKey,
    zValidator("json", sourceUpdateSchema, (result, c) => {
      if (!result.success) return c.json({ detail: result.error.errors }, 422);
    }),
    async (c) => {
      const sourceId = c.req.param("source_id");
      const existing = await getSourceById(db, sourceId);
      if (!existing) return c.json({ detail: "Source not found" }, 404);
      const data = c.req.valid("json");
      try {
        const updated = await updateSource(db, sourceId, data);
        return c.json(formatSourceResponse(updated!));
      } catch (err) {
        if (getPgErrorCode(err) === "23505") {
          return c.json({ detail: "Source with this RSS URL already exists" }, 409);
        }
        throw err;
      }
    },
  );

  app.delete("/sources/:source_id", verifyApiKey, async (c) => {
    const sourceId = c.req.param("source_id");
    const existing = await getSourceById(db, sourceId);
    if (!existing) return c.json({ detail: "Source not found" }, 404);
    const deactivated = await deactivateSource(db, sourceId);
    return c.json(formatSourceResponse(deactivated));
  });

  return app;
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
    await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_SOURCE) });
    const res = await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_SOURCE) });
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
        body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: `https://example.com/feed/${i}`, name: `Source ${i}` }),
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
    await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/active" }) });
    const res2 = await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/inactive" }) });
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
        body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: `https://example.com/feed/page-${i}`, name: `Source ${i}` }),
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
    const createRes = await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_SOURCE) });
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
    await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/first" }) });
    const createRes2 = await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...SAMPLE_SOURCE, rss_url: "https://example.com/feed/second" }) });
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
    const createRes = await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_SOURCE) });
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
    const createRes = await app.request("/sources", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(SAMPLE_SOURCE) });
    const { id } = await createRes.json();

    await app.request(`/sources/${id}`, { method: "DELETE", headers: jsonHeaders() });

    const res = await app.request("/sources");
    const data = await res.json();
    const source = data.items.find((s: any) => s.id === id);
    expect(source.is_active).toBe(false);
  });
});
