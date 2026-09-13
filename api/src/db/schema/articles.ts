import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceUrl: text("source_url").notNull().unique(),
    sourceName: varchar("source_name", { length: 100 }),
    titleOriginal: text("title_original"),
    titleJa: text("title_ja"),
    bodyOriginal: text("body_original"),
    bodyTranslated: text("body_translated"),
    summaryJa: text("summary_ja"),
    author: varchar("author", { length: 200 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ogImageUrl: text("og_image_url"),
    categories: text("categories").array(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // ASC serves the "next article" neighbor query; DESC NULLS LAST serves the
    // list, RSS, related-articles, and "previous article" queries.
    index("ix_articles_published_at").on(table.publishedAt),
    index("ix_articles_published_at_desc").on(table.publishedAt.desc().nullsLast()),
    // Polled every 5s by the SSE article monitor and used by the digest source query.
    index("ix_articles_created_at").on(table.createdAt),
  ],
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
