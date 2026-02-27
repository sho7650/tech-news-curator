import { describe, it, expect } from "vitest";
import { getTestDb } from "./setup.js";
import { createDigest, getDigestByDate, getDigests } from "../src/services/digest-service.js";
import type { DigestCreate } from "../src/schemas/digest.js";

function makeDigestData(overrides: Partial<DigestCreate> = {}): DigestCreate {
  return {
    digest_date: "2026-01-15",
    title: "テストダイジェスト",
    content: "ダイジェスト内容",
    article_count: 5,
    ...overrides,
  };
}

describe("Digest Service", () => {
  it("should create digest", async () => {
    const db = getTestDb();
    const data = makeDigestData();
    const digest = await createDigest(db, data);

    expect(digest.id).toBeDefined();
    expect(digest.digestDate).toBe("2026-01-15");
    expect(digest.title).toBe("テストダイジェスト");
  });

  it("should reject duplicate date", async () => {
    const db = getTestDb();
    await createDigest(db, makeDigestData());

    await expect(createDigest(db, makeDigestData({ title: "別のダイジェスト" }))).rejects.toThrow();
  });

  it("should paginate digests", async () => {
    const db = getTestDb();
    for (let i = 0; i < 5; i++) {
      await createDigest(db, makeDigestData({ digest_date: `2026-01-${15 + i}` }));
    }

    const { items, total } = await getDigests(db, 1, 2);
    expect(total).toBe(5);
    expect(items).toHaveLength(2);
  });

  it("should order digests by date descending", async () => {
    const db = getTestDb();
    for (let i = 0; i < 3; i++) {
      await createDigest(db, makeDigestData({ digest_date: `2026-01-${15 + i}` }));
    }

    const { items } = await getDigests(db);
    expect(items[0].digestDate).toBe("2026-01-17");
    expect(items[1].digestDate).toBe("2026-01-16");
    expect(items[2].digestDate).toBe("2026-01-15");
  });

  it("should find digest by date", async () => {
    const db = getTestDb();
    await createDigest(db, makeDigestData());

    const result = await getDigestByDate(db, "2026-01-15");
    expect(result).not.toBeNull();
    expect(result!.digestDate).toBe("2026-01-15");
  });

  it("should return null for non-existent date", async () => {
    const db = getTestDb();
    const result = await getDigestByDate(db, "2099-12-31");
    expect(result).toBeNull();
  });
});
