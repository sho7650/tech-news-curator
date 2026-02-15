import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDigestByDate } from '@/lib/api'

export default async function DigestPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  let digest
  try {
    digest = await getDigestByDate(date)
  } catch {
    notFound()
  }

  return (
    <div>
      <Link href="/digest" className="mb-4 inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-accent">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
        </svg>
        ダイジェスト一覧に戻る
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-text-primary">{digest.title || digest.digest_date}</h1>
      <div className="mb-6 flex items-center gap-3 text-sm text-text-muted">
        <time>{digest.digest_date}</time>
        {digest.article_count != null && (
          <span>{digest.article_count}件の記事</span>
        )}
      </div>
      {digest.content && (
        <div className="prose max-w-none whitespace-pre-wrap text-text-primary">
          {digest.content}
        </div>
      )}
    </div>
  )
}
