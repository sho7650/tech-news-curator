import { getSources } from '@/lib/api'

export default async function SourcesPage() {
  let data
  try {
    data = await getSources()
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">ソース一覧</h1>
        <p className="text-gray-500">ソース情報を取得できませんでした。</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">ソース一覧</h1>
      {data.items.length === 0 ? (
        <p className="text-gray-500">登録されたソースがありません。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((source) => (
            <div
              key={source.id}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <h2 className="font-semibold text-gray-900">
                {source.name || 'Unnamed'}
              </h2>
              {source.category && (
                <span className="mt-1 inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                  {source.category}
                </span>
              )}
              <p className="mt-2 truncate text-sm text-gray-500">
                {source.rss_url}
              </p>
              {source.site_url && (
                <a
                  href={source.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-sm text-blue-600 hover:underline"
                >
                  サイトを開く
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
