'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface StickyArticleTitleProps {
  title: string
  imageUrl: string | null
  triggerId: string
}

export default function StickyArticleTitle({ title, imageUrl, triggerId }: StickyArticleTitleProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const trigger = document.getElementById(triggerId)
    if (!trigger) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(!entry.isIntersecting)
      },
      { threshold: 0, rootMargin: '0px 0px 0px 0px' }
    )

    observer.observe(trigger)
    return () => observer.disconnect()
  }, [triggerId])

  return (
    <div
      data-testid="sticky-title"
      className={`sticky top-14 z-40 border-b border-border bg-bg-primary/80 backdrop-blur-md transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        {imageUrl && (
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded">
            <Image
              src={imageUrl}
              alt=""
              fill
              className="object-cover"
              sizes="36px"
            />
          </div>
        )}
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
      </div>
    </div>
  )
}
