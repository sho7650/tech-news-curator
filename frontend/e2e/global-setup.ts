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
      og_image_url: 'https://via.placeholder.com/800x400',
      published_at: new Date().toISOString(),
    },
  ]
  for (const article of articles) {
    await api.post('/articles', { data: article })
  }

  // テスト用ダイジェストを投入
  await api.post('/digest', {
    data: {
      digest_date: new Date().toISOString().split('T')[0],
      title: 'テストダイジェスト',
      content: 'テストダイジェストの内容です。',
      article_count: articles.length,
    },
  })

  // テスト用ソースを投入
  await api.post('/sources', {
    data: {
      name: 'TechCrunch',
      rss_url: 'https://techcrunch.com/feed/',
      site_url: 'https://techcrunch.com',
      category: 'general',
    },
  })

  await api.dispose()
}

export default globalSetup
