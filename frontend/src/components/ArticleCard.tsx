'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ArticleListItem } from '@/lib/types'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import ArticleImage from '@/components/ArticleImage'

export default function ArticleCard({ article }: { article: ArticleListItem }) {
  const [imageError, setImageError] = useState(false)
  const hasImage = Boolean(article.og_image_url) && !imageError

  const meta: string[] = []
  if (article.source_name) meta.push(article.source_name)
  if (article.author) meta.push(article.author)
  const relTime = formatRelativeTime(article.published_at)
  if (relTime) meta.push(relTime)

  return (
    <article
      aria-label={article.title_ja || '記事'}
      className="rounded-xl border border-border bg-bg-card transition-all duration-200 hover:shadow-lg hover:scale-[1.02]"
    >
      <Link href={`/articles/${article.id}`}>
        {hasImage && (
          <ArticleImage
            src={article.og_image_url!}
            alt={article.title_ja || 'article image'}
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            onImageError={() => setImageError(true)}
          />
        )}
        <div className="p-4">
          {article.categories && article.categories.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {article.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded bg-badge-bg px-2 py-0.5 text-xs text-badge-text"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
          <h2 className="mb-2 line-clamp-2 text-lg font-semibold text-text-primary">
            {article.title_ja || '(タイトルなし)'}
          </h2>
          {article.summary_ja && (
            <p className="mb-3 line-clamp-3 text-sm text-text-secondary">
              {article.summary_ja}
            </p>
          )}
          {meta.length > 0 && (
            <p className="text-xs text-text-muted">
              {meta.join(' · ')}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}
