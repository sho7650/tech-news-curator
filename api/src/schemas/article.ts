import { z } from "zod";
import { dateString, isoDateTime, paginatedSchema, paginationQuery } from "./base.js";

export const articleCreateSchema = z
  .object({
    source_url: z.string().url(),
    source_name: z.string().max(100).nullish(),
    title_original: z.string().max(500).nullish(),
    title_ja: z.string().max(500).nullish(),
    body_original: z.string().max(200000).nullish(),
    body_translated: z.string().max(200000).nullish(),
    summary_ja: z.string().max(5000).nullish(),
    author: z.string().max(200).nullish(),
    published_at: z.string().datetime({ offset: true }).nullish(),
    og_image_url: z.string().url().max(2083).nullish(),
    categories: z.array(z.string().max(50)).max(20).nullish(),
    metadata: z.record(z.unknown()).nullish(),
  })
  .strict();

export type ArticleCreate = z.infer<typeof articleCreateSchema>;

export const articleListQuerySchema = paginationQuery.extend({
  date: dateString.optional(),
  category: z.string().max(50).optional(),
});

export const articleCheckQuerySchema = z.object({
  url: z.string().url(),
});

export const articleCheckResponseSchema = z.object({
  exists: z.boolean(),
});

export const articleListItemSchema = z.object({
  id: z.string().uuid(),
  source_url: z.string(),
  source_name: z.string().nullable(),
  title_ja: z.string().nullable(),
  summary_ja: z.string().nullable(),
  author: z.string().nullable(),
  published_at: isoDateTime.nullable(),
  og_image_url: z.string().nullable(),
  categories: z.array(z.string()).nullable(),
  created_at: isoDateTime,
});

export type ArticleListItem = z.infer<typeof articleListItemSchema>;

export const articleListResponseSchema = paginatedSchema(articleListItemSchema);

export const articleDetailSchema = articleListItemSchema.extend({
  title_original: z.string().nullable(),
  body_original: z.string().nullable(),
  body_translated: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
});

export type ArticleDetail = z.infer<typeof articleDetailSchema>;

export const articleNeighborItemSchema = z.object({
  id: z.string().uuid(),
  title_ja: z.string().nullable(),
  og_image_url: z.string().nullable(),
  published_at: isoDateTime.nullable(),
});

export type ArticleNeighborItem = z.infer<typeof articleNeighborItemSchema>;

export const articleNeighborsResponseSchema = z.object({
  prev: articleNeighborItemSchema.nullable(),
  next: articleNeighborItemSchema.nullable(),
});

export type ArticleNeighborsResponse = z.infer<typeof articleNeighborsResponseSchema>;
