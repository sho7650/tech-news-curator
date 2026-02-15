import type { ArticleListItem } from '@/lib/types'
import ArticleCard from '@/components/ArticleCard'

interface ArticleGridProps {
  articles: ArticleListItem[]
}

export default function ArticleGrid({ articles }: ArticleGridProps) {
  if (articles.length === 0) return null

  return (
    <section aria-label="記事一覧">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  )
}
