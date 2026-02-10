import Link from 'next/link'
import type { DigestListItem } from '@/lib/types'

export default function DigestCard({ digest }: { digest: DigestListItem }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md">
      <Link href={`/digest/${digest.digest_date}`}>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          {digest.title || digest.digest_date}
        </h2>
      </Link>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <time>{digest.digest_date}</time>
        {digest.article_count != null && (
          <span>{digest.article_count}件の記事</span>
        )}
      </div>
    </article>
  )
}
