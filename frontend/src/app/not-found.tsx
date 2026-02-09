import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="mb-4 text-4xl font-bold text-gray-900">404</h1>
      <p className="mb-6 text-gray-600">ページが見つかりませんでした。</p>
      <Link href="/" className="text-blue-600 hover:underline">
        トップページに戻る
      </Link>
    </div>
  )
}
