'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface CategoryFilterProps {
  categories: string[]
}

export default function CategoryFilter({ categories }: CategoryFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('category')

  function handleSelect(category: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (category) {
      params.set('category', category)
    } else {
      params.delete('category')
    }
    router.push(`/articles?${params.toString()}`)
  }

  if (categories.length === 0) return null

  return (
    <nav aria-label="カテゴリフィルタ" role="navigation" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        <li>
          <button
            onClick={() => handleSelect(null)}
            aria-pressed={!current}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !current
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            すべて
          </button>
        </li>
        {categories.map((cat) => (
          <li key={cat}>
            <button
              onClick={() => handleSelect(cat)}
              aria-pressed={current === cat}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                current === cat
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
