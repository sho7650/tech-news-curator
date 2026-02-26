import { count, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema/index.js";
import { sources } from "../db/schema/index.js";
import type { SourceCreate, SourceUpdate } from "../schemas/source.js";

type DB = PostgresJsDatabase<typeof schema>;

export async function createSource(db: DB, data: SourceCreate) {
  const [source] = await db
    .insert(sources)
    .values({
      name: data.name,
      rssUrl: data.rss_url,
      siteUrl: data.site_url ?? null,
      category: data.category ?? null,
    })
    .returning();
  return source;
}

export async function getSources(
  db: DB,
  page = 1,
  perPage = 20,
  activeOnly = false,
): Promise<{ items: (typeof sources.$inferSelect)[]; total: number }> {
  const whereClause = activeOnly ? eq(sources.isActive, true) : undefined;

  const [totalResult] = await db.select({ count: count() }).from(sources).where(whereClause);
  const total = totalResult.count;

  const items = await db
    .select()
    .from(sources)
    .where(whereClause)
    .orderBy(desc(sources.createdAt))
    .offset((page - 1) * perPage)
    .limit(perPage);

  return { items, total };
}

export async function getSourceById(db: DB, sourceId: string) {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  return source ?? null;
}

export async function updateSource(db: DB, sourceId: string, data: SourceUpdate) {
  // Build update object from only defined (sent) fields
  // undefined = not sent, null = explicitly null (rejected by schema for required fields)
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.rss_url !== undefined) updateData.rssUrl = data.rss_url;
  if (data.site_url !== undefined) updateData.siteUrl = data.site_url;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.is_active !== undefined) updateData.isActive = data.is_active;

  if (Object.keys(updateData).length === 0) {
    // No fields to update, return existing
    return getSourceById(db, sourceId);
  }

  const [updated] = await db
    .update(sources)
    .set(updateData)
    .where(eq(sources.id, sourceId))
    .returning();
  return updated;
}

export async function deactivateSource(db: DB, sourceId: string) {
  const [deactivated] = await db
    .update(sources)
    .set({ isActive: false })
    .where(eq(sources.id, sourceId))
    .returning();
  return deactivated;
}
