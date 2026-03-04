import { count, desc, eq } from "drizzle-orm";
import type { DB } from "../database.js";
import { sources } from "../db/schema/index.js";
import type { SourceCreate, SourceUpdate } from "../schemas/source.js";

// Column-aware type for partial updates — NOT NULL columns exclude null
interface SourceUpdateData {
  name?: string;
  rssUrl?: string;
  siteUrl?: string | null;
  category?: string | null;
  isActive?: boolean;
}

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
  const updateData: SourceUpdateData = {};

  // NOT NULL columns: double-guard null (Zod refine already prevents, this narrows the type)
  if (data.name != null) updateData.name = data.name;
  if (data.rss_url != null) updateData.rssUrl = data.rss_url;
  // Nullable columns: null clears the value
  if (data.site_url !== undefined) updateData.siteUrl = data.site_url ?? null;
  if (data.category !== undefined) updateData.category = data.category ?? null;
  // NOT NULL with default
  if (data.is_active != null) updateData.isActive = data.is_active;

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
