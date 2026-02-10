import { getArticles } from '@/lib/api'
import ArticleCard from '@/components/ArticleCard'

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
      <p className="mb-4 text-sm text-gray-500">全{data.total}件</p>
      {data.items.length === 0 ? (
        <p className="text-gray-500">まだ記事がありません。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}
