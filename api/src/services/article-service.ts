import { and, arrayContains, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema/index.js";
import { articles } from "../db/schema/index.js";
import type { ArticleCreate } from "../schemas/article.js";

type DB = PostgresJsDatabase<typeof schema>;

export async function checkArticleExists(db: DB, url: string): Promise<boolean> {
  const result = await db
    .select({ count: count() })
    .from(articles)
    .where(eq(articles.sourceUrl, url));
  return result[0].count > 0;
}

export async function createArticle(db: DB, data: ArticleCreate) {
  const [article] = await db
    .insert(articles)
    .values({
      sourceUrl: data.source_url,
      sourceName: data.source_name ?? null,
      titleOriginal: data.title_original ?? null,
      titleJa: data.title_ja ?? null,
      bodyOriginal: data.body_original ?? null,
      bodyTranslated: data.body_translated ?? null,
      summaryJa: data.summary_ja ?? null,
      author: data.author ?? null,
      publishedAt: data.published_at ? new Date(data.published_at) : null,
      ogImageUrl: data.og_image_url ?? null,
      categories: data.categories ?? null,
      metadata: data.metadata ?? null,
    })
    .returning();
  return article;
}

export async function getArticles(
  db: DB,
  page = 1,
  perPage = 20,
  dateFilter?: string,
  categoryFilter?: string,
): Promise<{ items: (typeof articles.$inferSelect)[]; total: number }> {
  const conditions = [];

  if (dateFilter) {
    const start = new Date(`${dateFilter}T00:00:00Z`);
    const end = new Date(start.getTime() + 86400000); // +1 day
    conditions.push(gte(articles.publishedAt, start));
    conditions.push(lt(articles.publishedAt, end));
  }

  if (categoryFilter) {
    conditions.push(arrayContains(articles.categories, [categoryFilter]));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ count: count() }).from(articles).where(whereClause);
  const total = totalResult.count;

  const items = await db
    .select()
    .from(articles)
    .where(whereClause)
    .orderBy(desc(articles.publishedAt))
    .offset((page - 1) * perPage)
    .limit(perPage);

  return { items, total };
}

export async function getArticleById(db: DB, articleId: string) {
  const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
  return article ?? null;
}
