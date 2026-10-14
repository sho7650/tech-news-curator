import { describe, expect, it, vi } from "vitest";
import type { DB } from "../src/database.js";
import { articles } from "../src/db/schema/index.js";
import { pollNewArticles } from "../src/services/article-monitor.js";
import { articleBroker } from "../src/services/sse-broker.js";
import { getTestDb } from "./setup.js";

async function seedArticle(db: DB, createdAt: Date) {
  const [row] = await db
    .insert(articles)
    .values({
      sourceUrl: `https://example.com/${createdAt.getTime()}`,
      titleJa: "テスト",
      createdAt,
    })
    .returning();
  return row;
}

describe("pollNewArticles", () => {
  it("advances the cursor without querying when no clients are connected", async () => {
    const db = getTestDb();
    const since = new Date("2026-01-01T00:00:00Z");
    const before = Date.now();

    const next = await pollNewArticles(db, since);

    expect(next.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("broadcasts articles created after the cursor and returns the newest created_at", async () => {
    const db = getTestDb();
    const clientId = articleBroker.subscribe();
    try {
      const since = new Date("2026-01-01T00:00:00Z");
      await seedArticle(db, new Date("2025-12-31T00:00:00Z")); // older, must be skipped
      const fresh = await seedArticle(db, new Date("2026-01-02T00:00:00Z"));

      const next = await pollNewArticles(db, since);
      const event = await articleBroker.waitForEvent(clientId, 100);

      expect(next.toISOString()).toBe(fresh.createdAt.toISOString());
      expect(event).toMatchObject({ id: fresh.id, title_ja: "テスト" });
      expect(await articleBroker.waitForEvent(clientId, 50)).toBeNull();
    } finally {
      articleBroker.unsubscribe(clientId);
    }
  });

  it("keeps the cursor when nothing is new", async () => {
    const db = getTestDb();
    const clientId = articleBroker.subscribe();
    try {
      const since = new Date("2030-01-01T00:00:00Z");
      expect(await pollNewArticles(db, since)).toBe(since);
    } finally {
      articleBroker.unsubscribe(clientId);
    }
  });

  it("swallows query errors and keeps the cursor so the loop survives", async () => {
    const clientId = articleBroker.subscribe();
    try {
      const since = new Date("2026-01-01T00:00:00Z");
      const failing = {
        select: vi.fn(() => {
          throw new Error("connection lost");
        }),
      } as unknown as DB;

      await expect(pollNewArticles(failing, since)).resolves.toBe(since);
    } finally {
      articleBroker.unsubscribe(clientId);
    }
  });
});
