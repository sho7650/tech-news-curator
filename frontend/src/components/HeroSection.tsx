'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ArticleListItem } from '@/lib/types'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import ArticleImage from '@/components/ArticleImage'

function HeroCard({ article, large }: { article: ArticleListItem; large?: boolean }) {
  const [imageError, setImageError] = useState(false)

  const meta: string[] = []
  if (article.source_name) meta.push(article.source_name)
  if (article.author) meta.push(article.author)
  const relTime = formatRelativeTime(article.published_at)
  if (relTime) meta.push(relTime)

  return (
    <article className={`group relative overflow-hidden rounded-xl border border-border bg-bg-card transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${large ? 'lg:col-span-2' : ''}`}>
      <Link href={`/articles/${article.id}`}>
        {!imageError && article.og_image_url ? (
          <div className="relative">
            <ArticleImage
              src={article.og_image_url}
              alt={article.title_ja || 'article image'}
              sizes={large ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'}
              eager
              onImageError={() => setImageError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              {article.categories && article.categories.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {article.categories.map((cat) => (
                    <span key={cat} className="rounded bg-accent/90 px-2 py-0.5 text-xs font-medium text-white">
                      {cat}
                    </span>
                  ))}
                </div>
              )}
              <h2 className={`line-clamp-2 font-bold text-white ${large ? 'text-xl lg:text-2xl' : 'text-lg'}`}>
                {article.title_ja || '(タイトルなし)'}
              </h2>
              {meta.length > 0 && (
                <p className="mt-2 text-xs text-white/70">
                  {meta.join(' · ')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4">
            {article.categories && article.categories.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {article.categories.map((cat) => (
                  <span key={cat} className="rounded bg-badge-bg px-2 py-0.5 text-xs text-badge-text">
                    {cat}
                  </span>
                ))}
              </div>
            )}
            <h2 className={`mb-2 line-clamp-2 font-bold text-text-primary ${large ? 'text-xl lg:text-2xl' : 'text-lg'}`}>
              {article.title_ja || '(タイトルなし)'}
            </h2>
            {article.summary_ja && (
              <p className="mb-3 line-clamp-2 text-sm text-text-secondary">
                {article.summary_ja}
              </p>
            )}
            {meta.length > 0 && (
              <p className="text-xs text-text-muted">
                {meta.join(' · ')}
              </p>
            )}
          </div>
        )}
      </Link>
    </article>
  )
}

interface HeroSectionProps {
  articles: ArticleListItem[]
}

export default function HeroSection({ articles }: HeroSectionProps) {
  if (articles.length === 0) return null

  return (
    <section aria-label="注目記事">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article, index) => (
          <HeroCard key={article.id} article={article} large={index === 0} />
        ))}
      </div>
    </section>
  )
}
