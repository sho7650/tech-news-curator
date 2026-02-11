import { getArticles } from '@/lib/api'
import ArticleListLive from '@/components/ArticleListLive'

export default async function HomePage() {
  let data
  try {
    data = await getArticles(1)
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">最新のテックニュース</h1>
        <p className="text-gray-500">
          記事を取得できませんでした。APIが起動しているか確認してください。
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">最新のテックニュース</h1>
      <ArticleListLive
        initialArticles={data.items}
        total={data.total}
        initialPage={1}
        perPage={20}
      />
    </div>
  )
}
