import { count, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema/index.js";
import { digests } from "../db/schema/index.js";
import type { DigestCreate } from "../schemas/digest.js";

type DB = PostgresJsDatabase<typeof schema>;

export async function createDigest(db: DB, data: DigestCreate) {
  const [digest] = await db
    .insert(digests)
    .values({
      digestDate: data.digest_date,
      title: data.title ?? null,
      content: data.content ?? null,
      articleCount: data.article_count ?? null,
      articleIds: data.article_ids ?? null,
    })
    .returning();
  return digest;
}

export async function getDigests(
  db: DB,
  page = 1,
  perPage = 20,
): Promise<{ items: (typeof digests.$inferSelect)[]; total: number }> {
  const [totalResult] = await db.select({ count: count() }).from(digests);
  const total = totalResult.count;

  const items = await db
    .select()
    .from(digests)
    .orderBy(desc(digests.digestDate))
    .offset((page - 1) * perPage)
    .limit(perPage);

  return { items, total };
}

export async function getDigestByDate(db: DB, digestDate: string) {
  const [digest] = await db.select().from(digests).where(eq(digests.digestDate, digestDate));
  return digest ?? null;
}
