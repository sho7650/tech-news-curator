import Link from 'next/link'
import Image from 'next/image'
import type { ArticleNeighborItem } from '@/lib/types'

interface ArticleNavigationProps {
  prev: ArticleNeighborItem | null
  next: ArticleNeighborItem | null
}

function NavCard({ article, direction }: { article: ArticleNeighborItem; direction: 'prev' | 'next' }) {
  const isPrev = direction === 'prev'

  return (
    <Link
      href={`/articles/${article.id}`}
      className={`group flex items-center gap-3 rounded-xl border border-border bg-bg-card p-4 transition-all hover:shadow-md hover:scale-[1.01] ${
        isPrev ? 'flex-row' : 'flex-row-reverse text-right'
      } ${isPrev ? 'sm:col-start-1' : 'sm:col-start-2'}`}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
        {article.og_image_url ? (
          <Image
            src={article.og_image_url}
            alt=""
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="h-full w-full bg-bg-secondary rounded-lg" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">
          {isPrev ? '← 前の記事' : '次の記事 →'}
        </p>
        <p className="mt-1 line-clamp-2 text-sm font-medium text-text-primary">
          {article.title_ja || '(タイトルなし)'}
        </p>
      </div>
    </Link>
  )
}

export default function ArticleNavigation({ prev, next }: ArticleNavigationProps) {
  if (!prev && !next) return null

  return (
    <nav aria-label="前後の記事" className="mt-12 grid grid-cols-1 gap-4 border-t border-border pt-8 sm:grid-cols-2">
      {prev && <NavCard article={prev} direction="prev" />}
      {next && <NavCard article={next} direction="next" />}
    </nav>
  )
}
