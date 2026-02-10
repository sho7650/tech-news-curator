import { getArticles } from '@/lib/api'
import ArticleListLive from '@/components/ArticleListLive'

export default async function ArticlesPage() {
  let data
  try {
    data = await getArticles(1)
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">記事一覧</h1>
        <p className="text-gray-500">記事を取得できませんでした。</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">記事一覧</h1>
      <ArticleListLive initialArticles={data.items} total={data.total} />
    </div>
  )
}
