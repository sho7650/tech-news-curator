import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import type { IngestResponse } from "../schemas/ingest.js";
import { safeFetch } from "./safe-fetch.js";

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

// --- Content-level text cleanup ---

interface CleanArticleOptions {
  byline?: string | null;
}

const AUTHOR_BIO_INDICATORS: RegExp[] = [
  /\bis an?\b/i,
  /\breporter\b/i,
  /\beditor\b/i,
  /\bwriter\b/i,
  /\bjournalist\b/i,
  /\bcorrespondent\b/i,
  /\bcolumnist\b/i,
  /\blives? in\b/i,
  /\bbased in\b/i,
  /\bcovers?\b/i,
  /\bwrites? about\b/i,
  /\bco-hosts?\b/i,
  /\bpodcast\b/i,
];

function removeDuplicateParagraphs(text: string): string {
  const paragraphs = text.split("\n\n");
  const seen = new Set<string>();
  const result: string[] = [];

  for (const para of paragraphs) {
    const normalized = para.trim();
    if (normalized === "") {
      result.push(para);
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(para);
    }
  }

  return result.join("\n\n");
}

function removeTrailingAuthorBio(text: string, byline: string | null): string {
  if (!byline) return text;

  const firstName = byline.trim().split(/\s+/)[0];
  if (!firstName || firstName.length < 2) return text;

  const paragraphs = text.split("\n\n");
  if (paragraphs.length === 0) return text;

  // Only check the last 3 paragraphs
  const startIdx = Math.max(0, paragraphs.length - 3);

  for (let i = paragraphs.length - 1; i >= startIdx; i--) {
    const para = paragraphs[i].trim();
    if (para.length === 0 || para.length > 500) continue;

    if (!para.startsWith(firstName)) continue;

    const matchCount = AUTHOR_BIO_INDICATORS.reduce(
      (count, re) => count + (re.test(para) ? 1 : 0),
      0,
    );

    if (matchCount >= 2) {
      paragraphs.splice(i, 1);
      break; // Remove at most one bio paragraph
    }
  }

  return paragraphs.join("\n\n");
}

export function cleanArticleText(text: string, options: CleanArticleOptions = {}): string {
  let cleaned = text;

  // 1. Remove duplicate paragraphs (e.g., caption text duplicated outside <figure>)
  cleaned = removeDuplicateParagraphs(cleaned);

  // 2. Remove Credit lines — both full-line and inline trailing
  cleaned = cleaned.replace(/[ \t]*\bCredit:\s+.+$/gm, "").replace(/^\s+$/gm, "");

  // 3. Remove comment links (Markdown and plain text forms)
  cleaned = cleaned
    .replace(/\[\d+\s+Comments?\]\(.*?\)/g, "")
    .replace(/^\d+\s+Comments?\s*$/gm, "");

  // 4. Remove trailing author bio
  cleaned = removeTrailingAuthorBio(cleaned, options.byline ?? null);

  // 5. Final whitespace normalization
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

export async function extractArticle(url: string): Promise<IngestResponse | null> {
  const html = await safeFetch(url);
  if (!html) return null;

  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) return null;

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

  return {
    title: article.title ?? null,
    body,
    author: article.byline ?? null,
    published_at: publishedAt,
    og_image_url: ogImage,
  };
}
