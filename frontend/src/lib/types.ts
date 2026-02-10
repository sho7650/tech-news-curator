export interface ArticleListItem {
  id: string
  source_url: string
  source_name: string | null
  title_ja: string | null
  summary_ja: string | null
  author: string | null
  published_at: string | null
  og_image_url: string | null
  categories: string[] | null
  created_at: string
}

export interface ArticleDetail {
  id: string
  source_url: string
  source_name: string | null
  title_original: string | null
  title_ja: string | null
  body_translated: string | null
  summary_ja: string | null
  author: string | null
  published_at: string | null
  og_image_url: string | null
  categories: string[] | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ArticleListResponse {
  items: ArticleListItem[]
  total: number
  page: number
  per_page: number
}

export interface DigestListItem {
  id: string
  digest_date: string
  title: string | null
  article_count: number | null
  created_at: string
}

export interface DigestResponse {
  id: string
  digest_date: string
  title: string | null
  content: string | null
  article_count: number | null
  article_ids: string[] | null
  created_at: string
}

export interface DigestListResponse {
  items: DigestListItem[]
  total: number
}
