import Link from 'next/link'
import type { DigestListItem } from '@/lib/types'

export default function DigestCard({ digest }: { digest: DigestListItem }) {
  return (
    <article className="rounded-lg border border-border bg-bg-card p-5 transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
      <Link href={`/digest/${digest.digest_date}`}>
        <h2 className="mb-2 text-lg font-semibold text-text-primary">
          {digest.title || digest.digest_date}
        </h2>
      </Link>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <time>{digest.digest_date}</time>
        {digest.article_count != null && (
          <span>{digest.article_count}件の記事</span>
        )}
      </div>
    </article>
  )
}
