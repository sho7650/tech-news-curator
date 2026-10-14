import type { Article } from "../db/schema/index.js";
import type {
  ArticleDetail,
  ArticleListItem,
  ArticleNeighborItem,
  ArticleNeighborsResponse,
} from "../schemas/article.js";

// Columns a list-shaped query must project; bodies are never sent in lists.
export type ArticleListRow = Pick<
  Article,
  | "id"
  | "sourceUrl"
  | "sourceName"
  | "titleJa"
  | "summaryJa"
  | "author"
  | "publishedAt"
  | "ogImageUrl"
  | "categories"
  | "createdAt"
>;

export type ArticleNeighborRow = Pick<Article, "id" | "titleJa" | "ogImageUrl" | "publishedAt">;

export interface ArticleNeighborRows {
  prev: ArticleNeighborRow | null;
  next: ArticleNeighborRow | null;
}

export function formatArticleListItem(article: ArticleListRow): ArticleListItem {
  return {
    id: article.id,
    source_url: article.sourceUrl,
    source_name: article.sourceName ?? null,
    title_ja: article.titleJa ?? null,
    summary_ja: article.summaryJa ?? null,
    author: article.author ?? null,
    published_at: article.publishedAt?.toISOString() ?? null,
    og_image_url: article.ogImageUrl ?? null,
    categories: article.categories ?? null,
    created_at: article.createdAt.toISOString(),
  };
}

function formatMetadata(metadata: unknown): Record<string, unknown> | null {
  return metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
}

export function formatArticleDetail(article: Article): ArticleDetail {
  return {
    id: article.id,
    source_url: article.sourceUrl,
    source_name: article.sourceName ?? null,
    title_original: article.titleOriginal ?? null,
    title_ja: article.titleJa ?? null,
    body_original: article.bodyOriginal ?? null,
    body_translated: article.bodyTranslated ?? null,
    summary_ja: article.summaryJa ?? null,
    author: article.author ?? null,
    published_at: article.publishedAt?.toISOString() ?? null,
    og_image_url: article.ogImageUrl ?? null,
    categories: article.categories ?? null,
    metadata: formatMetadata(article.metadata),
    created_at: article.createdAt.toISOString(),
  };
}

function formatNeighborItem(neighbor: ArticleNeighborRow): ArticleNeighborItem {
  return {
    id: neighbor.id,
    title_ja: neighbor.titleJa ?? null,
    og_image_url: neighbor.ogImageUrl ?? null,
    published_at: neighbor.publishedAt?.toISOString() ?? null,
  };
}

export function formatNeighborsResponse(neighbors: ArticleNeighborRows): ArticleNeighborsResponse {
  return {
    prev: neighbors.prev ? formatNeighborItem(neighbors.prev) : null,
    next: neighbors.next ? formatNeighborItem(neighbors.next) : null,
  };
}
