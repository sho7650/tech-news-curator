import { getArticles, getCategories } from '@/lib/api'
import ArticleListLive from '@/components/ArticleListLive'
import CategoryFilter from '@/components/CategoryFilter'

// Next.js 15+ で searchParams は Promise 型に変更された。
// 出典: https://nextjs.org/docs/app/api-reference/file-conventions/page
interface Props {
  searchParams: Promise<{ category?: string }>
}

export default async function ArticlesPage({ searchParams }: Props) {
  const params = await searchParams
  const category = params.category

  let data
  try {
    data = await getArticles(1, category)
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-text-primary">記事一覧</h1>
        <p className="text-text-muted">記事を取得できませんでした。</p>
      </div>
    )
  }

  // カテゴリ一覧: フィルタなしの全記事からユニークカテゴリを取得
  let categories: string[] = []
  try {
    categories = await getCategories()
  } catch {
    // カテゴリ取得失敗はフィルタ非表示で継続
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">記事一覧</h1>
      <CategoryFilter categories={categories} />
      <ArticleListLive
        key={category || 'all'}
        initialArticles={data.items}
        total={data.total}
        initialPage={1}
        perPage={20}
        category={category}
      />
    </div>
  )
}
