import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import { getArticleById, getArticleNeighbors, getArticles } from '@/lib/api'
import ReadingTime from '@/components/ReadingTime'
import ScrollProgress from '@/components/ScrollProgress'
import StickyArticleTitle from '@/components/StickyArticleTitle'
import TableOfContents from '@/components/TableOfContents'
import RelatedArticles from '@/components/RelatedArticles'
import ArticleNavigation from '@/components/ArticleNavigation'

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

  const firstCategory = article.categories?.[0]
  const [relatedData, neighbors] = await Promise.all([
    firstCategory ? getArticles(1, firstCategory) : Promise.resolve(null),
    getArticleNeighbors(article.id),
  ])
  const relatedArticles = relatedData
    ? relatedData.items.filter((a) => a.id !== article.id).slice(0, 5)
    : []

  const bodyText = article.body_translated || article.summary_ja || ''
  const triggerId = article.og_image_url ? 'hero-image' : 'article-meta'

  return (
    <>
      <ScrollProgress />
      <StickyArticleTitle
        title={article.title_ja || article.title_original || '(タイトルなし)'}
        imageUrl={article.og_image_url}
        triggerId={triggerId}
      />

      <div className="mb-6">
        <Link href="/articles" className="inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-accent">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          記事一覧に戻る
        </Link>
      </div>

      {/* Lead image */}
      {article.og_image_url && (
        <div id="hero-image" className="relative mb-6 aspect-video w-full overflow-hidden rounded-xl">
          <Image
            src={article.og_image_url}
            alt={article.title_ja || 'article image'}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 65ch"
            priority
          />
        </div>
      )}

      {/* Title */}
      <h1 className="mb-4 text-2xl font-bold text-text-primary lg:text-3xl">
        {article.title_ja || article.title_original || '(タイトルなし)'}
      </h1>

      {/* Meta info */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
        {article.source_name && <span>{article.source_name}</span>}
        {article.source_name && article.author && <span className="text-accent">·</span>}
        {article.author && <span>{article.author}</span>}
        {(article.source_name || article.author) && article.published_at && <span className="text-accent">·</span>}
        {article.published_at && (
          <time>{new Date(article.published_at).toLocaleDateString('ja-JP')}</time>
        )}
        {bodyText && (
          <>
            <span className="text-accent">·</span>
            <ReadingTime text={bodyText} />
          </>
        )}
        {/^https?:\/\//.test(article.source_url) && (
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent transition-colors hover:text-accent-hover"
          >
            元記事を読む
          </a>
        )}
      </div>

      {/* Categories */}
      {article.categories && article.categories.length > 0 && (
        <div id="article-meta" className="mb-6 flex flex-wrap gap-2">
          {article.categories.map((cat) => (
            <span key={cat} className="rounded bg-badge-bg px-2 py-1 text-xs text-badge-text">
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Mobile TOC */}
      {article.body_translated && (
        <div className="lg:hidden">
          <TableOfContents contentId="article-content" />
        </div>
      )}

      {/* Content area with sidebar */}
      <div className="flex gap-8">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          {article.summary_ja && (
            <div className="mb-6 rounded-lg border border-border bg-bg-secondary p-4 text-sm text-text-secondary">
              <p className="mb-1 font-semibold text-text-muted">要約</p>
              <ReactMarkdown>{article.summary_ja}</ReactMarkdown>
            </div>
          )}

          {article.body_translated && (
            <div id="article-content" className="markdown-body mx-auto max-w-prose">
              <ReactMarkdown>{article.body_translated}</ReactMarkdown>
            </div>
          )}

          {/* Prev/Next navigation */}
          <ArticleNavigation prev={neighbors.prev} next={neighbors.next} />

          {/* Mobile related articles */}
          <div className="mt-8 lg:hidden">
            <RelatedArticles articles={relatedArticles} />
          </div>
        </div>

        {/* Sidebar (desktop only) */}
        {article.body_translated && (
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <TableOfContents contentId="article-content" />
              <RelatedArticles articles={relatedArticles} />
            </div>
          </aside>
        )}
      </div>
    </>
  )
}
