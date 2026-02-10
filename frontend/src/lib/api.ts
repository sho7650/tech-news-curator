import type {
  ArticleDetail,
  ArticleListResponse,
  DigestListResponse,
  DigestResponse,
} from './types'

const API_BASE = process.env.API_URL || 'http://news-api:8100'

export async function getArticles(page: number = 1): Promise<ArticleListResponse> {
  const res = await fetch(`${API_BASE}/articles?page=${page}&per_page=20`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error('Failed to fetch articles')
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
