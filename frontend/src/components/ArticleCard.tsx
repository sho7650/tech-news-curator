import Link from 'next/link'
import type { ArticleListItem } from '@/lib/types'

export default function ArticleCard({ article }: { article: ArticleListItem }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md">
      <Link href={`/articles/${article.id}`}>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          {article.title_ja || '(タイトルなし)'}
        </h2>
      </Link>
      {article.summary_ja && (
        <p className="mb-3 line-clamp-3 text-sm text-gray-600">{article.summary_ja}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        {article.source_name && <span>{article.source_name}</span>}
        {article.author && <span>{article.author}</span>}
        {article.published_at && (
          <time>{new Date(article.published_at).toLocaleDateString('ja-JP')}</time>
        )}
        {article.categories?.map((cat) => (
          <span key={cat} className="rounded bg-gray-100 px-2 py-0.5">
            {cat}
          </span>
        ))}
      </div>
    </article>
  )
}
