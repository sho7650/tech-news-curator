import { request } from '@playwright/test'

const API_URL = 'http://localhost:8100'
const API_KEY = process.env.TEST_API_KEY || 'test-key-for-testing'

async function globalSetup() {
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { 'X-API-Key': API_KEY },
  })

  // テスト用記事を投入
  const articles = [
    {
      source_url: 'https://example.com/e2e-article-1',
      source_name: 'TechCrunch',
      title_original: 'Test Article 1',
      title_ja: 'テスト記事 1',
      summary_ja: 'テスト記事1の要約です。',
      categories: ['ai', 'startup'],
      published_at: new Date().toISOString(),
    },
    {
      source_url: 'https://example.com/e2e-article-2',
      source_name: 'The Verge',
      title_original: 'Test Article 2',
      title_ja: 'テスト記事 2',
      summary_ja: 'テスト記事2の要約です。',
      categories: ['hardware'],
      published_at: new Date().toISOString(),
    },
  ]
  for (const article of articles) {
    const res = await api.post('/articles', { data: article })
    // 201=作成成功, 409=既存（リトライ時）— どちらも正常
    if (!res.ok() && res.status() !== 409) {
      throw new Error(`Seed article failed: ${res.status()} ${res.statusText()}`)
    }
  }

  // テスト用ダイジェストを投入
  const digestRes = await api.post('/digest', {
    data: {
      digest_date: new Date().toISOString().split('T')[0],
      title: 'テストダイジェスト',
      content: 'テストダイジェストの内容です。',
      article_count: articles.length,
    },
  })
  if (!digestRes.ok() && digestRes.status() !== 409) {
    throw new Error(`Seed digest failed: ${digestRes.status()} ${digestRes.statusText()}`)
  }

  // テスト用ソースを投入
  const sourceRes = await api.post('/sources', {
    data: {
      name: 'TechCrunch',
      rss_url: 'https://techcrunch.com/feed/',
      site_url: 'https://techcrunch.com',
      category: 'general',
    },
  })
  if (!sourceRes.ok() && sourceRes.status() !== 409) {
    throw new Error(`Seed source failed: ${sourceRes.status()} ${sourceRes.statusText()}`)
  }

  await api.dispose()
}

export default globalSetup
