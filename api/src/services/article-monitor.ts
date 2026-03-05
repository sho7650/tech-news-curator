import { gt } from "drizzle-orm";
import type { DB } from "../database.js";
import { articles } from "../db/schema/index.js";
import { rootLogger } from "../lib/logger.js";
import { articleBroker } from "./sse-broker.js";

const POLL_INTERVAL_MS = 5000;
const logger = rootLogger.child({ service: "article-monitor" });

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
      articleBroker.broadcast({
        id: article.id,
        source_url: article.sourceUrl,
        source_name: article.sourceName ?? null,
        title_ja: article.titleJa ?? null,
        summary_ja: article.summaryJa ?? null,
        author: article.author ?? null,
        published_at: article.publishedAt?.toISOString() ?? null,
        og_image_url: article.ogImageUrl ?? null,
        categories: article.categories ?? null,
        created_at: article.createdAt.toISOString(),
      });
    }

    if (result.length > 0) {
      lastChecked = result[result.length - 1].createdAt;
    }
  } catch (err) {
    logger.error({ err }, "polling error");
  }
}

export function startMonitor(db: DB): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }
  lastChecked = new Date();
  monitorInterval = setInterval(() => {
    pollNewArticles(db).catch((err) => {
      logger.error({ err }, "polling error");
    });
  }, POLL_INTERVAL_MS);
}

export function stopMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
