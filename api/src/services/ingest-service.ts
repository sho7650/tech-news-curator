import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import type { AppLogger } from "../lib/logger.js";
import { rootLogger } from "../lib/logger.js";
import type { IngestResponse } from "../schemas/ingest.js";
import { safeFetch } from "./safe-fetch.js";
import { cleanArticleText } from "./text-cleaner.js";

const NOISE_SELECTORS = ["figcaption", "aside", "nav", '[role="complementary"]', "figure"];

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// Remove image tags (not needed for text translation)
turndown.addRule("removeImages", {
  filter: "img",
  replacement: () => "",
});

// Remove <a> tags that wrap only images (empty after image removal)
turndown.addRule("removeImageLinks", {
  filter: (node) => {
    if (node.nodeName !== "A") return false;
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1 && child.nodeName === "IMG") continue;
      if (child.nodeType === 3 && child.textContent?.trim() === "") continue;
      return false;
    }
    return true;
  },
  replacement: () => "",
});

export function htmlToMarkdown(html: string): string {
  const { document } = parseHTML(html);

  for (const selector of NOISE_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      el.remove();
    }
  }

  const md = turndown.turndown(document.toString());

  return md
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\[\]\(.*?\)/g, "")
    .replace(/^\d+\.\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Re-export for backwards compatibility with tests
export { cleanArticleText } from "./text-cleaner.js";

export async function extractArticle(
  url: string,
  fetcher: (url: string, logger?: AppLogger) => Promise<string | null> = safeFetch,
  logger?: AppLogger,
): Promise<IngestResponse | null> {
  const log = logger?.child({ service: "ingest" }) ?? rootLogger.child({ service: "ingest" });

  log.info({ url }, "extraction started");

  const html = await fetcher(url, log);
  if (!html) {
    log.warn({ url }, "failed to fetch HTML");
    return null;
  }

  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) {
    log.warn({ url, htmlLength: html.length }, "Readability failed to parse article");
    return null;
  }

  const rawMd = article.content ? htmlToMarkdown(article.content) : null;
  const body = rawMd ? cleanArticleText(rawMd, { byline: article.byline ?? null }) : null;

  // Extract og:image from meta tags
  const ogImage =
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;

  // Extract published date from meta tags
  const publishedAt =
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ??
    document.querySelector('meta[name="date"]')?.getAttribute("content") ??
    null;

  log.info({ url, title: article.title }, "extraction successful");

  return {
    title: article.title ?? null,
    body,
    author: article.byline?.trim() || null,
    published_at: publishedAt,
    og_image_url: ogImage,
  };
}
