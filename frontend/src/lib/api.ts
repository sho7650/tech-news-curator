import 'server-only'

import type {
  ArticleDetail,
  ArticleListResponse,
  DigestListResponse,
  DigestResponse,
  SourceListResponse,
} from './types'

const API_BASE = process.env.API_URL || 'http://news-api:8100'

export async function getArticles(
  page: number = 1,
  category?: string,
): Promise<ArticleListResponse> {
  const params = new URLSearchParams({ page: String(page), per_page: '20' })
  if (category) params.set('category', category)
  const res = await fetch(`${API_BASE}/articles?${params}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getArticleById(id: string): Promise<ArticleDetail> {
  const res = await fetch(`${API_BASE}/articles/${id}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Failed to fetch article: ${id}`)
  return res.json()
}

export async function getDigests(): Promise<DigestListResponse> {
  const res = await fetch(`${API_BASE}/digest`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error('Failed to fetch digests')
  return res.json()
}

export async function getDigestByDate(date: string): Promise<DigestResponse> {
  const res = await fetch(`${API_BASE}/digest/${date}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Failed to fetch digest: ${date}`)
  return res.json()
}

export async function getSources(): Promise<SourceListResponse> {
  const res = await fetch(`${API_BASE}/sources?active_only=true`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Sources API error: ${res.status}`)
  return res.json()
}

/**
 * ユニークなカテゴリ名の一覧を取得する。
 * 専用 API エンドポイントは設けず、記事一覧（ページ1、per_page=20）の
 * categories フィールドから重複除去して返す。
 * 最新20件のカテゴリで十分な網羅性がある前提。
 * Phase 3 で記事数増大時に専用 GET /categories API を検討する。
 */
export async function getCategories(): Promise<string[]> {
  const data = await getArticles(1)
  const categories = new Set<string>()
  for (const item of data.items) {
    if (item.categories) {
      for (const cat of item.categories) {
        categories.add(cat)
      }
    }
  }
  return Array.from(categories).sort()
}
