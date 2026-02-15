'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-4 py-24 text-center">
      <h2 className="mb-4 text-2xl font-bold text-text-primary">
        エラーが発生しました
      </h2>
      <p className="mb-8 text-text-secondary">
        {error.message || 'ページの読み込みに失敗しました。'}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-6 py-2 text-white transition-colors hover:bg-accent-hover"
      >
        もう一度試す
      </button>
    </div>
  )
}
