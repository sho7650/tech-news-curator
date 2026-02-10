import Link from 'next/link'

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Tech News Curator
        </Link>
        <div className="flex gap-6">
          <Link href="/articles" className="text-gray-600 hover:text-gray-900">
            記事一覧
          </Link>
          <Link href="/digest" className="text-gray-600 hover:text-gray-900">
            ダイジェスト
          </Link>
        </div>
      </nav>
    </header>
  )
}
