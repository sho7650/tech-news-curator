import { getSources } from '@/lib/api'

export default async function SourcesPage() {
  let data
  try {
    data = await getSources()
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-text-primary">ソース一覧</h1>
        <p className="text-text-muted">ソース情報を取得できませんでした。</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">ソース一覧</h1>
      {data.items.length === 0 ? (
        <p className="text-text-muted">登録されたソースがありません。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((source) => (
            <div
              key={source.id}
              className="rounded-xl border border-border bg-bg-card p-4"
            >
              <h2 className="font-semibold text-text-primary">
                {source.name || 'Unnamed'}
              </h2>
              {source.category && (
                <span className="mt-1 inline-block rounded-full bg-badge-bg px-2.5 py-0.5 text-xs text-badge-text">
                  {source.category}
                </span>
              )}
              <p className="mt-2 truncate text-sm text-text-muted">
                {source.rss_url}
              </p>
              {source.site_url && (
                <a
                  href={source.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-sm text-accent transition-colors hover:text-accent-hover"
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
