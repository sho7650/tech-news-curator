import { z } from "zod";

export const ingestRequestSchema = z
  .object({
    url: z.string().url(),
  })
  .strict();

export const ingestResponseSchema = z.object({
  title: z.string().nullable(),
  body: z.string().nullable(),
  author: z.string().nullable(),
  published_at: z.string().nullable(),
  og_image_url: z.string().nullable(),
});

export type IngestResponse = z.infer<typeof ingestResponseSchema>;
