import { z } from "zod";
import { dateString, isoDateTime, paginatedSchema, paginationQuery } from "./base.js";

export const digestCreateSchema = z
  .object({
    digest_date: dateString,
    title: z.string().max(500).nullish(),
    content: z.string().max(100000).nullish(),
    article_count: z.number().int().min(0).max(10000).nullish(),
    article_ids: z.array(z.string().uuid()).max(1000).nullish(),
  })
  .strict();

export type DigestCreate = z.infer<typeof digestCreateSchema>;

export const digestListQuerySchema = paginationQuery;

export const digestSourceQuerySchema = z
  .object({
    date: dateString.optional(),
  })
  .strict();

export type DigestSourceQuery = z.infer<typeof digestSourceQuerySchema>;

export const digestSourceArticleSchema = z.object({
  id: z.string().uuid(),
  source_url: z.string(),
  source_name: z.string().nullable(),
  title_original: z.string().nullable(),
  title_ja: z.string().nullable(),
  summary_ja: z.string().nullable(),
  body_translated: z.string().nullable(),
  author: z.string().nullable(),
  published_at: isoDateTime.nullable(),
  categories: z.array(z.string()).nullable(),
  created_at: isoDateTime,
});

export type DigestSourceArticle = z.infer<typeof digestSourceArticleSchema>;

export const digestSourceResponseSchema = z.object({
  date: dateString,
  count: z.number().int(),
  truncated: z.boolean(),
  articles: z.array(digestSourceArticleSchema),
});

export type DigestSourceResponse = z.infer<typeof digestSourceResponseSchema>;

export const digestListItemSchema = z.object({
  id: z.string().uuid(),
  digest_date: dateString,
  title: z.string().nullable(),
  article_count: z.number().int().nullable(),
  created_at: isoDateTime,
});

export type DigestListItem = z.infer<typeof digestListItemSchema>;

export const digestListResponseSchema = paginatedSchema(digestListItemSchema);

export const digestResponseSchema = digestListItemSchema.extend({
  content: z.string().nullable(),
  article_ids: z.array(z.string().uuid()).nullable(),
});

export type DigestResponse = z.infer<typeof digestResponseSchema>;
