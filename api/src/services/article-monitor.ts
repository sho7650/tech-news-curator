import { gt } from "drizzle-orm";
import type { DB } from "../database.js";
import { articles } from "../db/schema/index.js";
import { rootLogger } from "../lib/logger.js";
import { formatArticleListItem } from "../mappers/article.js";
import { articleBroker } from "./sse-broker.js";

const POLL_INTERVAL_MS = 5000;
const logger = rootLogger.child({ service: "article-monitor" });

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let lastChecked = new Date();

// Broadcast articles created after `since` and return the next cursor.
// Errors are logged and the cursor is kept, so a transient DB failure never
// stops the loop or skips articles.
export async function pollNewArticles(db: DB, since: Date): Promise<Date> {
  if (articleBroker.clientCount === 0) {
    // No clients connected: advance the cursor to avoid a flood on reconnect.
    return new Date();
  }

  try {
    const result = await db
      .select({
        id: articles.id,
        sourceUrl: articles.sourceUrl,
        sourceName: articles.sourceName,
        titleJa: articles.titleJa,
        summaryJa: articles.summaryJa,
        author: articles.author,
        publishedAt: articles.publishedAt,
        ogImageUrl: articles.ogImageUrl,
        categories: articles.categories,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(gt(articles.createdAt, since))
      .orderBy(articles.createdAt);

    for (const article of result) {
      articleBroker.broadcast(formatArticleListItem(article));
    }

    return result.length > 0 ? result[result.length - 1].createdAt : since;
  } catch (err) {
    logger.error({ err }, "polling error");
    return since;
  }
}

export function startMonitor(db: DB): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }
  lastChecked = new Date();
  monitorInterval = setInterval(() => {
    pollNewArticles(db, lastChecked)
      .then((next) => {
        lastChecked = next;
      })
      .catch((err) => {
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
