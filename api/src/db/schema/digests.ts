import { date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const digests = pgTable("digests", {
  id: uuid("id").primaryKey().defaultRandom(),
  digestDate: date("digest_date", { mode: "string" }).notNull().unique(),
  title: text("title"),
  content: text("content"),
  articleCount: integer("article_count"),
  articleIds: uuid("article_ids").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Digest = typeof digests.$inferSelect;
export type NewDigest = typeof digests.$inferInsert;
