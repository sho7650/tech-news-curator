'use client'

import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from 'react'

interface TocItem {
  id: string
  text: string
  level: number
}

const emptyItems: TocItem[] = []

export default function TableOfContents({ contentId }: { contentId: string }) {
  const [activeId, setActiveId] = useState<string>('')
  const itemsRef = useRef<TocItem[]>(emptyItems)

  const subscribe = useCallback((onStoreChange: () => void) => {
    const container = document.getElementById(contentId)
    if (!container) return () => {}

    const headings = container.querySelectorAll('h2, h3')
    const tocItems: TocItem[] = []

    headings.forEach((heading, index) => {
      const id = heading.id || `heading-${index}`
      if (!heading.id) heading.id = id
      tocItems.push({
        id,
        text: heading.textContent || '',
        level: heading.tagName === 'H2' ? 2 : 3,
      })
    })

    itemsRef.current = tocItems
    onStoreChange()

    return () => {}
  }, [contentId])

  const items = useSyncExternalStore(
    subscribe,
    () => itemsRef.current,
    () => emptyItems
  )

  useEffect(() => {
    if (items.length < 3) return

    const container = document.getElementById(contentId)
    if (!container) return

    const headings = container.querySelectorAll('h2, h3')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )

    headings.forEach((heading) => observer.observe(heading))

    return () => observer.disconnect()
  }, [contentId, items.length])

  if (items.length < 3) return null

  return (
    <>
      {/* Desktop: sticky sidebar */}
      <nav
        aria-label="目次"
        className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
      >
        <h2 className="mb-3 text-sm font-bold text-text-primary">目次</h2>
        <ul className="space-y-1 border-l border-border">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block border-l-2 py-1 text-sm transition-colors ${
                  item.level === 3 ? 'pl-6' : 'pl-3'
                } ${
                  activeId === item.id
                    ? 'border-accent text-accent font-medium'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile: collapsible */}
      <details className="mb-6 rounded-lg border border-border bg-bg-secondary p-3 lg:hidden">
        <summary className="cursor-pointer text-sm font-bold text-text-primary">
          目次
        </summary>
        <ul className="mt-2 space-y-1 border-l border-border">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block py-1 text-sm text-text-muted hover:text-text-secondary ${
                  item.level === 3 ? 'pl-6' : 'pl-3'
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}
