import { z } from "zod";

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

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
      // Guard against Invalid Date: toISOString() throws on NaN time values.
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(d);
    },
    { message: "Invalid date" },
  );

export const digestDateParamSchema = z.object({
  digest_date: dateString,
});

// Response shapes below exist for the OpenAPI document and the frontend types
// generated from it; handlers are not validated against them at runtime.

export const isoDateTime = z.string().datetime({ offset: true });

// Every error response uses this envelope: a message, or zod issues on 422.
export const errorResponseSchema = z.object({
  detail: z.union([z.string(), z.array(z.record(z.unknown()))]),
});

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    per_page: z.number().int(),
  });
}
