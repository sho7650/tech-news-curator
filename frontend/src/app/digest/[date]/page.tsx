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
      <Link href="/digest" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        &larr; ダイジェスト一覧に戻る
      </Link>
      <h1 className="mb-2 text-2xl font-bold">{digest.title || digest.digest_date}</h1>
      <div className="mb-6 flex items-center gap-3 text-sm text-gray-500">
        <time>{digest.digest_date}</time>
        {digest.article_count != null && (
          <span>{digest.article_count}件の記事</span>
        )}
      </div>
      {digest.content && (
        <div className="prose max-w-none whitespace-pre-wrap">
          {digest.content}
        </div>
      )}
    </div>
  )
}
