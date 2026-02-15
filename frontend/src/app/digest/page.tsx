import { getDigests } from '@/lib/api'
import DigestCard from '@/components/DigestCard'

export default async function DigestsPage() {
  let data
  try {
    data = await getDigests()
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-text-primary">ダイジェスト一覧</h1>
        <p className="text-text-muted">ダイジェストを取得できませんでした。</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">ダイジェスト一覧</h1>
      <p className="mb-4 text-sm text-text-muted">全{data.total}件</p>
      {data.items.length === 0 ? (
        <p className="text-text-muted">まだダイジェストがありません。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((digest) => (
            <DigestCard key={digest.id} digest={digest} />
          ))}
        </div>
      )}
    </div>
  )
}
