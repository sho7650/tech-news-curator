import { z } from "zod";
import { paginationQuery } from "./base.js";

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
    og_image_url: z.string().max(2083).nullish(),
    categories: z.array(z.string().max(50)).max(20).nullish(),
    metadata: z.record(z.unknown()).nullish(),
  })
  .strict();

export type ArticleCreate = z.infer<typeof articleCreateSchema>;

export const articleListQuerySchema = paginationQuery.extend({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (d) => {
        const parsed = new Date(`${d}T00:00:00Z`);
        return parsed.toISOString().startsWith(d);
      },
      { message: "Invalid date" },
    )
    .optional(),
  category: z.string().max(50).optional(),
});

export type ArticleListQuery = z.infer<typeof articleListQuerySchema>;

export const articleCheckQuerySchema = z.object({
  url: z.string().url(),
});

export interface ArticleListItem {
  id: string;
  source_url: string;
  source_name: string | null;
  title_ja: string | null;
  summary_ja: string | null;
  author: string | null;
  published_at: string | null;
  og_image_url: string | null;
  categories: string[] | null;
  created_at: string;
}

export interface ArticleDetail {
  id: string;
  source_url: string;
  source_name: string | null;
  title_original: string | null;
  title_ja: string | null;
  body_translated: string | null;
  summary_ja: string | null;
  author: string | null;
  published_at: string | null;
  og_image_url: string | null;
  categories: string[] | null;
  metadata: Record<string, unknown> | null; // matches Zod z.record(z.unknown())
  created_at: string;
}

export interface ArticleListResponse {
  items: ArticleListItem[];
  total: number;
  page: number;
  per_page: number;
}
