import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { IngestResponse } from "../schemas/ingest.js";
import { safeFetch } from "./safe-fetch.js";

export async function extractArticle(url: string): Promise<IngestResponse | null> {
  const html = await safeFetch(url);
  if (!html) return null;

  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) return null;

  // Extract og:image from meta tags
  const ogImage =
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;

  // Extract published date from meta tags
  const publishedAt =
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ??
    document.querySelector('meta[name="date"]')?.getAttribute("content") ??
    null;

  return {
    title: article.title ?? null,
    body: article.textContent ?? null,
    author: article.byline ?? null,
    published_at: publishedAt,
    og_image_url: ogImage,
  };
}
