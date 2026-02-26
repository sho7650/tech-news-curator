import { z } from "zod";

export const sourceCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    rss_url: z.string().url(),
    site_url: z.string().url().nullish(),
    category: z.string().max(50).nullish(),
  })
  .strict();

export type SourceCreate = z.infer<typeof sourceCreateSchema>;

export const sourceUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).nullish(),
    rss_url: z.string().url().nullish(),
    site_url: z.string().url().nullish(),
    category: z.string().max(50).nullish(),
    is_active: z.boolean().nullish(),
  })
  .strict()
  .refine(
    (data) => {
      // Reject explicit null on required fields (DB NOT NULL constraint protection)
      if (data.name === null) return false;
      if (data.rss_url === null) return false;
      return true;
    },
    { message: "name and rss_url cannot be null" },
  );

export type SourceUpdate = z.infer<typeof sourceUpdateSchema>;

export const sourceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  active_only: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

export interface SourceResponse {
  id: string;
  name: string | null;
  rss_url: string;
  site_url: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
}
