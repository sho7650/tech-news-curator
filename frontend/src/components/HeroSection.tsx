'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ArticleListItem } from '@/lib/types'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import ArticleImage from '@/components/ArticleImage'

interface HeroSectionProps {
  articles: ArticleListItem[]
}

function HeroCard({ article }: { article: ArticleListItem }) {
  const [imageError, setImageError] = useState(false)

  const meta: string[] = []
  if (article.source_name) meta.push(article.source_name)
  if (article.author) meta.push(article.author)
  const relTime = formatRelativeTime(article.published_at)
  if (relTime) meta.push(relTime)

  return (
    <article className="rounded-xl border border-gray-200 bg-white transition-shadow duration-200 hover:shadow-lg">
      <Link href={`/articles/${article.id}`}>
        {!imageError && article.og_image_url && (
          <ArticleImage
            src={article.og_image_url}
            alt={article.title_ja || 'article image'}
            sizes="(max-width: 768px) 100vw, 50vw"
            eager
            onImageError={() => setImageError(true)}
          />
        )}
        <div className="p-4">
          {article.categories && article.categories.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {article.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
          <h2 className="mb-2 line-clamp-2 text-xl font-bold text-gray-900">
            {article.title_ja || '(タイトルなし)'}
          </h2>
          {article.summary_ja && (
            <p className="mb-3 line-clamp-2 text-sm text-gray-600">
              {article.summary_ja}
            </p>
          )}
          {meta.length > 0 && (
            <p className="text-xs text-gray-500">
              {meta.join(' · ')}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}

export default function HeroSection({ articles }: HeroSectionProps) {
  if (articles.length === 0) return null

  return (
    <section aria-label="注目記事">
      <div
        className={`grid gap-6 ${
          articles.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
        }`}
      >
        {articles.map((article) => (
          <HeroCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  )
}
