'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { ArticleListItem, ArticleListResponse } from '@/lib/types'
import HeroSection from '@/components/HeroSection'
import ArticleGrid from '@/components/ArticleGrid'

interface Props {
  initialArticles: ArticleListItem[]
  total: number
  initialPage: number
  perPage: number
}

function LoadingIndicator() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-gray-200 bg-white"
        >
          <div className="aspect-video rounded-t-xl bg-gray-200" />
          <div className="space-y-3 p-4">
            <div className="h-3 w-16 rounded bg-gray-200" />
            <div className="h-5 w-3/4 rounded bg-gray-200" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-gray-200" />
              <div className="h-3 w-5/6 rounded bg-gray-200" />
            </div>
            <div className="h-3 w-1/3 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ArticleListLive({
  initialArticles,
  total,
  initialPage,
  perPage,
}: Props) {
  const [articles, setArticles] = useState<ArticleListItem[]>(initialArticles)
  const [newCount, setNewCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialArticles.length < total)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const knownIds = useRef<Set<string>>(
    new Set(initialArticles.map((a) => a.id))
  )
  // Synchronous refs to avoid stale closures in Observer callback
  const pageRef = useRef(initialPage)
  const isLoadingRef = useRef(false)
  const hasMoreRef = useRef(initialArticles.length < total)

  const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || ''

  // Infinite scroll uses same-origin proxy (next.config.ts rewrites)
  // to avoid CORS issues regardless of browser origin
  const apiBase = '/api'

  // Hero: top 2 articles with images
  const heroArticles = useMemo(() => {
    return articles.filter((a) => Boolean(a.og_image_url)).slice(0, 2)
  }, [articles])

  // Grid: all articles except hero
  const gridArticles = useMemo(() => {
    const heroIds = new Set(heroArticles.map((a) => a.id))
    return articles.filter((a) => !heroIds.has(a.id))
  }, [articles, heroArticles])

  // Infinite scroll fetch — refs for synchronous guard
  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMoreRef.current) return
    isLoadingRef.current = true
    setIsLoading(true)
    try {
      const nextPage = pageRef.current + 1
      const res = await fetch(
        `${apiBase}/articles?page=${nextPage}&per_page=${perPage}`,
        { signal: AbortSignal.timeout(10_000) }
      )
      if (!res.ok) throw new Error('Failed to fetch')
      const data: ArticleListResponse = await res.json()

      const newArticles = data.items.filter(
        (a) => !knownIds.current.has(a.id)
      )
      newArticles.forEach((a) => knownIds.current.add(a.id))

      setArticles((prev) => {
        const merged = [...prev, ...newArticles]
        if (data.items.length < perPage || merged.length >= data.total) {
          hasMoreRef.current = false
          setHasMore(false)
        }
        return merged
      })
      pageRef.current = nextPage
    } catch (error) {
      console.error('Failed to load more articles:', error)
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [perPage, apiBase])

  // Stable ref so Observer never needs to re-subscribe
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  // Intersection Observer for infinite scroll — set up once
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current()
        }
      },
      {
        threshold: 0,
        rootMargin: '0px 0px 300px 0px',
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // SSE connection
  useEffect(() => {
    function connect() {
      esRef.current?.close()

      const es = new EventSource(`${sseUrl}/articles/stream`)
      esRef.current = es

      es.addEventListener('new_article', (e: MessageEvent) => {
        const article: ArticleListItem = JSON.parse(e.data)
        if (knownIds.current.has(article.id)) return
        knownIds.current.add(article.id)
        setArticles((prev) => [article, ...prev])
        setNewCount((c) => c + 1)
      })

      es.onerror = () => {
        console.warn('SSE connection error, will auto-reconnect')
      }
    }

    const handleVisibility = () => {
      if (document.hidden) {
        esRef.current?.close()
        esRef.current = null
      } else {
        connect()
      }
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      esRef.current?.close()
      esRef.current = null
    }
  }, [sseUrl])

  return (
    <div>
      {newCount > 0 && (
        <p className="mb-4 text-sm text-blue-600">
          {newCount}件の新着記事
        </p>
      )}

      <p className="mb-6 text-sm text-gray-500">
        全{articles.length}件表示
      </p>

      {articles.length === 0 ? (
        <p className="text-gray-500">まだ記事がありません。</p>
      ) : (
        <>
          <HeroSection articles={heroArticles} />

          {heroArticles.length > 0 && (
            <div className="my-8 border-b border-gray-200" />
          )}

          <ArticleGrid articles={gridArticles} />

          {isLoading && <LoadingIndicator />}

          {!hasMore && articles.length > 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              すべての記事を表示しました
            </p>
          )}

          {hasMore && <div ref={sentinelRef} className="h-px" />}
        </>
      )}
    </div>
  )
}
