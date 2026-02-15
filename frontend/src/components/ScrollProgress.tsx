'use client'

import { useEffect, useState } from 'react'

export default function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const scrollTop = document.documentElement.scrollTop
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
        const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0
        setProgress(pct)
        ticking = false
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div
      className="fixed left-0 top-0 z-50 h-1 bg-accent"
      style={{ width: `${progress}%`, transition: 'width 100ms linear' }}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="読了進捗"
    />
  )
}
