'use client'

import { useState } from 'react'
import Image from 'next/image'

interface ArticleImageProps {
  src: string
  alt: string
  sizes: string
  eager?: boolean
  onImageError?: () => void
}

export default function ArticleImage({
  src,
  alt,
  sizes,
  eager,
  onImageError,
}: ArticleImageProps) {
  const [hasError, setHasError] = useState(false)

  if (hasError) return null

  return (
    <div className="relative aspect-video overflow-hidden">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={eager ? 'eager' : 'lazy'}
        className="rounded-t-xl object-cover"
        onError={() => {
          setHasError(true)
          onImageError?.()
        }}
      />
    </div>
  )
}
