"use client"

import { useState, useEffect, useRef } from 'react'
import type { ArticleListItem } from '@/lib/types'
import ArticleCard from '@/components/ArticleCard'

interface Props {
  initialArticles: ArticleListItem[]
  total: number
}

export default function ArticleListLive({ initialArticles, total }: Props) {
  const [articles, setArticles] = useState(initialArticles)
  const [newCount, setNewCount] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || ''

    function connect() {
      esRef.current?.close()

      const es = new EventSource(`${sseUrl}/articles/stream`)
      esRef.current = es

      es.addEventListener('new_article', (e: MessageEvent) => {
        const article: ArticleListItem = JSON.parse(e.data)
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
  }, [])

  return (
    <div>
      {newCount > 0 && (
        <p className="mb-4 text-sm text-blue-600">
          {newCount}件の新着記事
        </p>
      )}
      <p className="mb-4 text-sm text-gray-500">全{total + newCount}件</p>
      {articles.length === 0 ? (
        <p className="text-gray-500">まだ記事がありません。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}
