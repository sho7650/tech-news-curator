import { notFound } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { getArticleById } from '@/lib/api'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let article
  try {
    article = await getArticleById(id)
  } catch {
    notFound()
  }

  return (
    <div>
      <Link href="/articles" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        &larr; 記事一覧に戻る
      </Link>
      <h1 className="mb-2 text-2xl font-bold">{article.title_ja || article.title_original || '(タイトルなし)'}</h1>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-500">
        {article.source_name && <span>{article.source_name}</span>}
        {article.author && <span>{article.author}</span>}
        {article.published_at && (
          <time>{new Date(article.published_at).toLocaleDateString('ja-JP')}</time>
        )}
        <a
          href={article.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          元記事を読む
        </a>
      </div>
      {article.categories && article.categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {article.categories.map((cat) => (
            <span key={cat} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
              {cat}
            </span>
          ))}
        </div>
      )}
      {article.summary_ja && (
        <div className="mb-6 rounded bg-gray-800 p-4 text-sm text-gray-300">
          <p className="mb-1 font-semibold text-gray-400">要約</p>
          {/* react-markdown v10+ はデフォルトで raw HTML を描画しない（rehype-raw 不使用で安全） */}
          <ReactMarkdown>{article.summary_ja}</ReactMarkdown>
        </div>
      )}
      {article.body_translated && (
        <div className="markdown-body">
          <ReactMarkdown>{article.body_translated}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
