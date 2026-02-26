import { z } from "zod";

export const ingestRequestSchema = z
  .object({
    url: z.string().url(),
  })
  .strict();

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

export interface IngestResponse {
  title: string | null;
  body: string | null;
  author: string | null;
  published_at: string | null;
  og_image_url: string | null;
}
