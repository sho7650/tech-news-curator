import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="mb-4 text-4xl font-bold text-text-primary">404</h1>
      <p className="mb-6 text-text-secondary">ページが見つかりませんでした。</p>
      <Link href="/" className="text-accent transition-colors hover:text-accent-hover">
        トップページに戻る
      </Link>
    </div>
  )
}
