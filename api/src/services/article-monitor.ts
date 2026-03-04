import { gt } from "drizzle-orm";
import type { DB } from "../database.js";
import { articles } from "../db/schema/index.js";
import { articleBroker } from "./sse-broker.js";

const POLL_INTERVAL_MS = 5000;

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let lastChecked = new Date();

export async function pollNewArticles(db: DB): Promise<void> {
  if (articleBroker.clientCount === 0) {
    // No clients connected: advance lastChecked to prevent flooding
    lastChecked = new Date();
    return;
  }

  try {
    const result = await db
      .select()
      .from(articles)
      .where(gt(articles.createdAt, lastChecked))
      .orderBy(articles.createdAt);

    for (const article of result) {
      await articleBroker.broadcast({
        id: article.id,
        source_url: article.sourceUrl,
        source_name: article.sourceName,
        title_ja: article.titleJa,
        summary_ja: article.summaryJa,
        author: article.author,
        published_at: article.publishedAt?.toISOString() ?? null,
        og_image_url: article.ogImageUrl,
        categories: article.categories,
        created_at: article.createdAt.toISOString(),
      });
    }

    if (result.length > 0) {
      lastChecked = result[result.length - 1].createdAt;
    }
  } catch (err) {
    console.error("article_monitor: polling error", err);
  }
}

export function startMonitor(db: DB): void {
  lastChecked = new Date();
  monitorInterval = setInterval(() => {
    pollNewArticles(db).catch((err) => {
      console.error("article_monitor: polling error", err);
    });
  }, POLL_INTERVAL_MS);
}

export function stopMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
