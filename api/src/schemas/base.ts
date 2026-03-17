import { z } from "zod";

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

type PaginationQuery = z.infer<typeof paginationQuery>;

export const uuidParamSchema = z.object({
  article_id: z.string().uuid(),
});

export const sourceIdParamSchema = z.object({
  source_id: z.string().uuid(),
});

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
  .refine(
    (d) => {
      const parsed = new Date(`${d}T00:00:00Z`);
      return parsed.toISOString().startsWith(d);
    },
    { message: "Invalid date" },
  );

export const digestDateParamSchema = z.object({
  digest_date: dateString,
});
