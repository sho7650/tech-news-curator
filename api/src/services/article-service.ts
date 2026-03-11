import { and, arrayContains, asc, count, desc, eq, gt, gte, lt, ne, or, sql } from "drizzle-orm";
import type { DB } from "../database.js";
import { articles } from "../db/schema/index.js";
import type { ArticleCreate } from "../schemas/article.js";

const MS_PER_DAY = 86_400_000;

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

type ArticleListRow = Omit<typeof articles.$inferSelect, "bodyOriginal" | "bodyTranslated">;

export async function getArticles(
  db: DB,
  page = 1,
  perPage = 20,
  dateFilter?: string,
  categoryFilter?: string,
): Promise<{ items: ArticleListRow[]; total: number }> {
  const conditions = [];

  if (dateFilter) {
    const start = new Date(`${dateFilter}T00:00:00Z`);
    const end = new Date(start.getTime() + MS_PER_DAY);
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
    .select({
      id: articles.id,
      sourceUrl: articles.sourceUrl,
      sourceName: articles.sourceName,
      titleOriginal: articles.titleOriginal,
      titleJa: articles.titleJa,
      summaryJa: articles.summaryJa,
      author: articles.author,
      publishedAt: articles.publishedAt,
      ogImageUrl: articles.ogImageUrl,
      categories: articles.categories,
      metadata: articles.metadata,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(whereClause)
    .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`)
    .offset((page - 1) * perPage)
    .limit(perPage);

  return { items, total };
}

export async function getArticleById(db: DB, articleId: string) {
  const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
  return article ?? null;
}

interface ArticleNeighbor {
  id: string;
  titleJa: string | null;
  ogImageUrl: string | null;
  publishedAt: Date | null;
}

interface ArticleNeighbors {
  prev: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
}

const neighborFields = {
  id: articles.id,
  titleJa: articles.titleJa,
  ogImageUrl: articles.ogImageUrl,
  publishedAt: articles.publishedAt,
};

export async function getArticleNeighbors(
  db: DB,
  articleId: string,
): Promise<ArticleNeighbors | null> {
  const article = await getArticleById(db, articleId);
  if (!article) return null;

  if (!article.publishedAt) {
    return { prev: null, next: null };
  }

  const [prevResults, nextResults] = await Promise.all([
    // prev: published_at が古い中で最も新しい1件 (tiebreaker: created_at)
    db
      .select(neighborFields)
      .from(articles)
      .where(
        and(
          ne(articles.id, articleId),
          or(
            lt(articles.publishedAt, article.publishedAt),
            and(
              eq(articles.publishedAt, article.publishedAt),
              lt(articles.createdAt, article.createdAt),
            ),
          ),
        ),
      )
      .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`, desc(articles.createdAt))
      .limit(1),
    // next: published_at が新しい中で最も古い1件 (tiebreaker: created_at)
    db
      .select(neighborFields)
      .from(articles)
      .where(
        and(
          ne(articles.id, articleId),
          or(
            gt(articles.publishedAt, article.publishedAt),
            and(
              eq(articles.publishedAt, article.publishedAt),
              gt(articles.createdAt, article.createdAt),
            ),
          ),
        ),
      )
      .orderBy(sql`${articles.publishedAt} ASC NULLS LAST`, asc(articles.createdAt))
      .limit(1),
  ]);

  return {
    prev: prevResults[0] ?? null,
    next: nextResults[0] ?? null,
  };
}
