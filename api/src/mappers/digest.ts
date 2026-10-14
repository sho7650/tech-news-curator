import type { Digest } from "../db/schema/index.js";
import type { DigestListItem, DigestResponse, DigestSourceArticle } from "../schemas/digest.js";
import type { DigestSourceRow } from "../services/article-service.js";

export function formatDigestResponse(digest: Digest): DigestResponse {
  return {
    id: digest.id,
    digest_date: digest.digestDate,
    title: digest.title ?? null,
    content: digest.content ?? null,
    article_count: digest.articleCount ?? null,
    article_ids: digest.articleIds ?? null,
    created_at: digest.createdAt.toISOString(),
  };
}

export function formatDigestListItem(digest: Digest): DigestListItem {
  return {
    id: digest.id,
    digest_date: digest.digestDate,
    title: digest.title ?? null,
    article_count: digest.articleCount ?? null,
    created_at: digest.createdAt.toISOString(),
  };
}

export function formatDigestSourceArticle(row: DigestSourceRow): DigestSourceArticle {
  return {
    id: row.id,
    source_url: row.sourceUrl,
    source_name: row.sourceName ?? null,
    title_original: row.titleOriginal ?? null,
    title_ja: row.titleJa ?? null,
    summary_ja: row.summaryJa ?? null,
    body_translated: row.bodyTranslated ?? null,
    author: row.author ?? null,
    published_at: row.publishedAt?.toISOString() ?? null,
    categories: row.categories ?? null,
    created_at: row.createdAt.toISOString(),
  };
}
