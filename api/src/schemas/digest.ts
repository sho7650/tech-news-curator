import { z } from "zod";

export const digestCreateSchema = z
  .object({
    digest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().max(500).nullish(),
    content: z.string().max(100000).nullish(),
    article_count: z.number().int().min(0).max(10000).nullish(),
    article_ids: z.array(z.string().uuid()).max(1000).nullish(),
  })
  .strict();

export type DigestCreate = z.infer<typeof digestCreateSchema>;

export const digestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

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
