import { getArticles } from '@/lib/api'
import ArticleCard from '@/components/ArticleCard'

export default async function HomePage() {
  let data
  try {
    data = await getArticles(1)
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">最新のテックニュース</h1>
        <p className="text-gray-500">記事を取得できませんでした。APIが起動しているか確認してください。</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">最新のテックニュース</h1>
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
