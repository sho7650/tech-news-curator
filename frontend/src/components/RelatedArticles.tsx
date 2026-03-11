import Link from 'next/link'
import Image from 'next/image'
import type { ArticleListItem } from '@/lib/types'
import { formatRelativeTime } from '@/lib/formatRelativeTime'

interface RelatedArticlesProps {
  articles: ArticleListItem[]
}

export default function RelatedArticles({ articles }: RelatedArticlesProps) {
  if (articles.length === 0) return null

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h2 className="mb-3 text-sm font-bold text-text-primary">関連記事</h2>
      <div className="space-y-3">
        {articles.map((article) => {
          const meta: string[] = []
          if (article.source_name) meta.push(article.source_name)
          const relTime = formatRelativeTime(article.published_at)
          if (relTime) meta.push(relTime)

          return (
            <Link
              key={article.id}
              href={`/articles/${article.id}`}
              className="flex gap-3 rounded-lg p-1 transition-colors hover:bg-bg-secondary"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded">
                {article.og_image_url ? (
                  <Image
                    src={article.og_image_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="h-full w-full bg-bg-secondary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm text-text-primary">{article.title_ja || '(タイトルなし)'}</p>
                {meta.length > 0 && (
                  <p className="mt-0.5 text-xs text-text-muted">{meta.join(' · ')}</p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
