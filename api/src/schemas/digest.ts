import { z } from "zod";
import { dateString, paginationQuery } from "./base.js";

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

export interface DigestSourceArticle {
  id: string;
  source_url: string;
  source_name: string | null;
  title_original: string | null;
  title_ja: string | null;
  summary_ja: string | null;
  body_translated: string | null;
  author: string | null;
  published_at: string | null;
  categories: string[] | null;
  created_at: string;
}

export interface DigestSourceResponse {
  date: string;
  count: number;
  truncated: boolean;
  articles: DigestSourceArticle[];
}

export interface DigestResponse {
  id: string;
  digest_date: string;
  title: string | null;
  content: string | null;
  article_count: number | null;
  article_ids: string[] | null;
  created_at: string;
}

export interface DigestListItem {
  id: string;
  digest_date: string;
  title: string | null;
  article_count: number | null;
  created_at: string;
}
