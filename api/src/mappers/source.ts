import type { Source } from "../db/schema/index.js";
import type { SourceResponse } from "../schemas/source.js";

export function formatSourceResponse(source: Source): SourceResponse {
  return {
    id: source.id,
    name: source.name ?? null,
    rss_url: source.rssUrl,
    site_url: source.siteUrl ?? null,
    category: source.category ?? null,
    is_active: source.isActive,
    created_at: source.createdAt.toISOString(),
  };
}
