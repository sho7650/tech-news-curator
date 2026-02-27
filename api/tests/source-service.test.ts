import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb } from "./setup.js";
import {
  createSource,
  deactivateSource,
  getSourceById,
  getSources,
  updateSource,
} from "../src/services/source-service.js";
import type { SourceCreate } from "../src/schemas/source.js";

function makeSourceData(overrides: Partial<SourceCreate> = {}): SourceCreate {
  return {
    name: "TechCrunch",
    rss_url: `https://example.com/feed/${randomUUID()}`,
    site_url: "https://example.com",
    category: "general",
    ...overrides,
  };
}

describe("Source Service", () => {
  it("should create source", async () => {
    const db = getTestDb();
    const data = makeSourceData();
    const source = await createSource(db, data);

    expect(source.id).toBeDefined();
    expect(source.name).toBe(data.name);
    expect(source.rssUrl).toBe(data.rss_url);
    expect(source.isActive).toBe(true);
  });

  it("should list sources", async () => {
    const db = getTestDb();
    for (let i = 0; i < 3; i++) {
      await createSource(db, makeSourceData({ name: `Source ${i}`, rss_url: `https://example.com/feed/${i}` }));
    }

    const { items, total } = await getSources(db);
    expect(total).toBe(3);
    expect(items).toHaveLength(3);
  });

  it("should filter active only", async () => {
    const db = getTestDb();
    await createSource(db, makeSourceData({ name: "Active Source" }));
    const source2 = await createSource(db, makeSourceData({ name: "Inactive Source" }));
    await deactivateSource(db, source2.id);

    const { items, total } = await getSources(db, 1, 20, true);
    expect(total).toBe(1);
    expect(items[0].name).toBe("Active Source");
  });

  it("should get source by id", async () => {
    const db = getTestDb();
    const data = makeSourceData();
    const source = await createSource(db, data);

    const found = await getSourceById(db, source.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(source.id);
    expect(found!.name).toBe(source.name);
  });

  it("should return null for non-existent id", async () => {
    const db = getTestDb();
    const found = await getSourceById(db, randomUUID());
    expect(found).toBeNull();
  });

  it("should partial update source", async () => {
    const db = getTestDb();
    const data = makeSourceData({ name: "Original Name", category: "tech" });
    const source = await createSource(db, data);

    const updated = await updateSource(db, source.id, { name: "Updated Name" });
    expect(updated!.name).toBe("Updated Name");
    expect(updated!.category).toBe("tech"); // unchanged
  });

  it("should deactivate source", async () => {
    const db = getTestDb();
    const data = makeSourceData();
    const source = await createSource(db, data);
    expect(source.isActive).toBe(true);

    const deactivated = await deactivateSource(db, source.id);
    expect(deactivated.isActive).toBe(false);
  });
});
