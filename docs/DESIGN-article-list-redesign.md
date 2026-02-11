# 記事一覧リデザイン + 無限スクロール 設計書

> Based on: `docs/REQUIREMENTS-article-list-redesign.md`
> Version: 1.0
> Date: 2026-02-11
> Status: 設計レビュー待ち

---

## 1. 設計概要

### スコープ

フロントエンド（`frontend/src/`）のみの変更。APIの変更は不要。

既存のoffset-based pagination API (`GET /articles?page=N&per_page=20`) とSSEストリーミング (`GET /articles/stream`) をそのまま活用し、フロントエンドのUI/UXを刷新する。

### 設計方針

| 方針 | 根拠 |
|------|------|
| Server Component + Client Component のハイブリッド構成 | 初回レンダリングはサーバーサイド、インタラクション（SSE・無限スクロール）はクライアント |
| `next/image` の `fill` + `sizes` パターン | 外部OG画像のサイズが不明のため、固定 width/height ではなくコンテナベースのレスポンシブ表示 |
| Intersection Observer sentinel パターン | リスト末尾に不可視の sentinel `<div>` を配置し、ビューポート接近時に次ページを自動取得 |
| Tailwind CSS v4 ユーティリティのみ | 追加CSSライブラリ不要。globals.css への追記は最小限 |

### 前提: Tailwind CSS v4 ユーティリティの利用可能性

本設計で使用する以下のユーティリティは、Tailwind CSS v4 でコアに含まれており、追加プラグインや設定は不要:

| ユーティリティ | 用途 | 確認状況 |
|---|---|---|
| `line-clamp-2`, `line-clamp-3` | サマリーの行数制限 | **既存コードで使用済み**（`ArticleCard.tsx:13` で `line-clamp-3`）。Tailwind v3.3+ でコア統合 |
| `aspect-video` (16/9) | OG画像のアスペクト比固定 | Tailwind v3.0+ でコア統合。v4 でも利用可能 |
| `animate-pulse` | スケルトンカードのアニメーション | Tailwind コアユーティリティ |
| CSS Grid (`grid`, `grid-cols-*`) | レスポンシブグリッド | Tailwind コアユーティリティ |

---

## 2. コンポーネントツリー

```
app/page.tsx (Server Component)
├── getArticles(1)                    ← サーバーサイドfetch (既存)
└── <ArticleListLive>                 ← Client Component (改修)
    ├── <HeroSection>                 ← 新規: ヒーローセクション
    │   └── <HeroCard> × 0〜2枚
    │       └── <ArticleImage>        ← 新規: next/image ラッパー
    ├── <ArticleGrid>                 ← 新規: レスポンシブグリッド
    │   └── <ArticleCard> × N枚      ← 全面改修
    │       └── <ArticleImage>?       ← 画像ありカードのみ
    ├── <LoadingIndicator>            ← 新規: スケルトン/スピナー
    └── <div ref={sentinelRef} />     ← 新規: Intersection Observer sentinel
```

### Server Component / Client Component の境界

| コンポーネント | 種別 | 理由 |
|---|---|---|
| `app/page.tsx` | Server | 初回データfetchはサーバーサイド |
| `app/articles/page.tsx` | Server | 同上 |
| `ArticleListLive` | Client (`"use client"`) | SSE接続・無限スクロール・state管理 |
| `HeroSection` | 通常関数（ArticleListLive内） | 親がClient Componentのため自動的にClient |
| `ArticleGrid` | 通常関数（ArticleListLive内） | 同上 |
| `ArticleCard` | 通常関数（ArticleListLive内から呼出） | 同上（Client境界の子） |
| `ArticleImage` | Client (`"use client"`) | `onError` コールバックが必要 |

> **注**: `ArticleCard` は現在 Server Component だが、`ArticleListLive`（Client Component）の子として呼び出されるため、実質的にClient Componentとして動作する。明示的に `"use client"` を付ける必要はないが、`ArticleImage` は `onError` を使うため明示的に `"use client"` が必要。

---

## 3. コンポーネント詳細設計

### 3.1 ArticleImage（新規）

**ファイル**: `frontend/src/components/ArticleImage.tsx`

**目的**: `next/image` による外部OG画像の最適化表示 + エラーハンドリング

```typescript
// Props
interface ArticleImageProps {
  src: string
  alt: string
  sizes: string              // レスポンシブsizes属性
  eager?: boolean            // ヒーロー画像用: true → loading="eager"
  onImageError?: () => void  // 画像読み込みエラー時の親への通知コールバック
}
```

**振る舞い**:
- `next/image` の `fill` プロップを使用（外部画像の寸法が不明のため）
- 親コンテナは `position: relative` + `aspect-ratio: 16/9` で16:9領域を確保
- `object-fit: cover` で領域をカバー
- `onError` 発火時:
  - 内部 state `hasError` を `true` にセットし、コンテナごと非表示（`return null`）
  - `props.onImageError` が渡されている場合、親にエラーを通知（親側でレイアウト切替に使用）
- `eager={true}` の場合: `loading="eager"` で優先読み込み（ヒーロー画像用）
- `eager` 省略時: `loading="lazy"`（デフォルト）

**`sizes` 属性の値**:
- ヒーローカード: `"(max-width: 768px) 100vw, 50vw"`
- 通常グリッドカード: `"(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"`

**技術的根拠**:
- Next.js 16 の `next/image`: `fill` プロップ使用時は `width`/`height` 不要（[Next.js公式ドキュメント](https://nextjs.org/docs/app/api-reference/components/image)）
- `onError` は Client Component でのみ動作（イベントハンドラはServer Componentでシリアライズ不可）
- Next.js 16 で `priority` prop は deprecated → `loading="eager"` に置き換え。props名も `eager` として混乱を回避

### 3.2 ArticleCard（全面改修）

**ファイル**: `frontend/src/components/ArticleCard.tsx`

**目的**: 画像の有無に応じたアダプティブカードデザイン

```typescript
// Props（変更なし — 既存の ArticleListItem をそのまま使用）
interface Props {
  article: ArticleListItem
}
```

**2つのレンダリングモード**:

#### A. 画像ありカード（`og_image_url` が存在 かつ `ArticleImage` がエラーを起こしていない場合）

```
┌─────────────────────────────┐
│  [OG画像 16:9 aspect-ratio] │  ← ArticleImage (fill, cover)
│                             │
├─────────────────────────────┤
│ ■ カテゴリ                   │  ← バッジ（gray-100 bg）
│ タイトル（日本語）            │  ← text-lg font-semibold, line-clamp-2
│ サマリー 2-3行...            │  ← text-sm text-gray-600, line-clamp-3
│ TechCrunch · 著者 · 3時間前  │  ← text-xs text-gray-500
└─────────────────────────────┘
```

#### B. テキスト専用カード（`og_image_url` が null または画像読み込みエラー）

```
┌─────────────────────────────┐
│ ■ カテゴリ                   │  ← バッジ（gray-100 bg）
│ タイトル（日本語）            │  ← text-lg font-semibold, line-clamp-2
│ サマリー 2-3行...            │  ← text-sm text-gray-600, line-clamp-3
│ TechCrunch · 著者 · 3時間前  │  ← text-xs text-gray-500
└─────────────────────────────┘
```

**カードスタイル**:
- 背景: `bg-white`
- ボーダー: `border border-gray-200`
- 角丸: `rounded-xl`（現状の`rounded-lg`からわずかにアップ）
- ホバー: `hover:shadow-lg transition-shadow duration-200`
- 画像部分の角丸: `rounded-t-xl`（カード上部のみ）
- パディング: テキスト部分のみ `p-4`（画像部分はパディングなし＝エッジtoエッジ）

**メタ情報の表示**:
- ソース名（`source_name`）: 存在する場合に表示
- 著者（`author`）: 存在する場合に表示
- 公開日時（`published_at`）: **相対時間**で表示（`formatRelativeTime` ユーティリティ使用）
- 区切り: 中黒 `·` で連結
- カテゴリ: メタ情報の上に小さなバッジとして表示（先頭に配置）

**画像エラーハンドリングの仕組み**:
- `ArticleCard` 自体は `og_image_url` の有無で初期レンダリングを分岐
- `ArticleCard` は内部 state `imageError` を持ち、初期値は `false`
- `ArticleImage` に `onImageError={() => setImageError(true)}` コールバックを渡す
- `ArticleImage` の `onError` 発火 → `props.onImageError()` を呼出 → 親の `imageError` が `true` に
- `imageError === true` の場合、画像セクションを非表示にしてテキスト専用カードにフォールバック
- これにより、URLは存在するが404の画像も適切にフォールバック

### 3.3 HeroSection（新規）

**ファイル**: `frontend/src/components/HeroSection.tsx`

**目的**: 画像付き最新記事を最大2件、大きく表示するヒーローセクション

```typescript
// Props
interface HeroSectionProps {
  articles: ArticleListItem[]  // 画像ありのフィルタ済み記事（最大2件）
}
```

**記事の選定ロジック**（`ArticleListLive` 内で実行）:
```
allArticles
  .filter(a => Boolean(a.og_image_url))  // null, undefined, 空文字を除外
  .slice(0, 2)
```

**レイアウト**:

```
デスクトップ (≥ 1024px):
┌──────────────────┬──────────────────┐
│   ヒーロー記事1   │   ヒーロー記事2   │  ← 2カラム均等
│   (大きな画像)    │   (大きな画像)    │
└──────────────────┴──────────────────┘

タブレット (768px - 1023px):
┌──────────────────┬──────────────────┐
│   ヒーロー記事1   │   ヒーロー記事2   │  ← 2カラム
└──────────────────┴──────────────────┘

モバイル (< 768px):
┌────────────────────────────────────┐
│          ヒーロー記事1              │  ← 1カラム
├────────────────────────────────────┤
│          ヒーロー記事2              │
└────────────────────────────────────┘
```

**ヒーローカードのスタイル**:
- 画像: `aspect-ratio: 16/9`, `ArticleImage` with `fill` + `cover`
- 画像の `sizes`: `"(max-width: 768px) 100vw, 50vw"`
- タイトル: `text-xl font-bold`（通常カードより大きめ）
- サマリー: `line-clamp-2`（ヒーローではサマリーは控えめに）
- カード全体がリンク（`<Link>` で囲む）
- 1件の場合: 1カラムフル幅で表示
- 0件（画像あり記事がない）場合: セクション自体を非表示

**ヒーロー画像エラー時のフォールバック**:
- 各ヒーローカードは内部 state `imageError` を持つ
- `ArticleImage` の `onImageError` で `imageError = true` に切替
- エラー時: 画像セクションを非表示にし、テキスト専用ヒーローカードとして表示（タイトル + サマリーのみの大型カード）
- ヒーローカードの表示**枠自体は維持**し、レイアウトシフトを防止（画像領域が消えるだけ）

**区切り**:
- ヒーローセクションと通常グリッドの間に `border-b border-gray-200 my-8` の区切り線

### 3.4 ArticleGrid（新規）

**ファイル**: `frontend/src/components/ArticleGrid.tsx`

**目的**: ヒーロー以外の記事をレスポンシブグリッドで表示

```typescript
// Props
interface ArticleGridProps {
  articles: ArticleListItem[]  // ヒーロー記事を除いた残りの記事
}
```

**グリッドレイアウト（Tailwind CSS）**:

```
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
```

| ブレークポイント | カラム数 | Tailwindクラス |
|---|---|---|
| < 768px (モバイル) | 1 | `grid-cols-1` |
| 768px - 1023px (タブレット) | 2 | `md:grid-cols-2` |
| ≥ 1024px (デスクトップ) | 3 | `lg:grid-cols-3` |

**グリッドアイテムの配置**:
- `grid-auto-rows` は指定しない（カードの自然な高さに任せる）
- 画像あり/なしカードが混在するため、行ごとの高さは揃えない（CSS Grid のデフォルト動作でカラム内が自然に流れる）
- `gap-6` (1.5rem = 24px) でカード間に統一した余白

**セマンティックHTML**:
- グリッドコンテナ: `<section aria-label="記事一覧">`
- 各カード: `<article>`（既存の`ArticleCard`で使用済み）

### 3.5 ArticleListLive（大幅改修）

**ファイル**: `frontend/src/components/ArticleListLive.tsx`

**目的**: SSEストリーミング + 無限スクロール + ヒーロー/グリッドレイアウトの統合管理

```typescript
// Props（拡張）
interface Props {
  initialArticles: ArticleListItem[]
  total: number
  initialPage: number  // 新規: 初期ページ番号（常に1）
  perPage: number      // 新規: ページあたり件数（常に20）
}
```

**State管理**:

```typescript
const [articles, setArticles] = useState<ArticleListItem[]>(initialArticles)
const [newCount, setNewCount] = useState(0)
const [page, setPage] = useState(initialPage)
const [isLoading, setIsLoading] = useState(false)
const [hasMore, setHasMore] = useState(initialArticles.length < total)
const sentinelRef = useRef<HTMLDivElement>(null)
const esRef = useRef<EventSource | null>(null)
const knownIds = useRef<Set<string>>(new Set(initialArticles.map(a => a.id)))
```

**レンダリング構造**:

```tsx
return (
  <div>
    {/* 新着記事バッジ（インライン表示、専用コンポーネントは不要） */}
    {newCount > 0 && (
      <p className="mb-4 text-sm text-blue-600">{newCount}件の新着記事</p>
    )}

    {/* 全件数: articles.length = 実際に表示中の記事数（SSE新着 + fetch済み全件） */}
    <p className="mb-6 text-sm text-gray-500">全{articles.length}件表示</p>

    {articles.length === 0 ? (
      <p className="text-gray-500">まだ記事がありません。</p>
    ) : (
      <>
        {/* ヒーローセクション */}
        <HeroSection articles={heroArticles} />

        {/* 区切り（ヒーローがある場合のみ） */}
        {heroArticles.length > 0 && (
          <div className="my-8 border-b border-gray-200" />
        )}

        {/* 通常記事グリッド */}
        <ArticleGrid articles={gridArticles} />

        {/* ローディングインジケーター */}
        {isLoading && <LoadingIndicator />}

        {/* 終端メッセージ */}
        {!hasMore && articles.length > 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            すべての記事を表示しました
          </p>
        )}

        {/* Intersection Observer sentinel */}
        {hasMore && <div ref={sentinelRef} className="h-px" />}
      </>
    )}
  </div>
)
```

**ヒーロー/グリッド記事の分離ロジック**:

```typescript
// ヒーロー: 画像ありの最新2件（null, undefined, 空文字を除外）
const heroArticles = useMemo(() => {
  return articles.filter(a => Boolean(a.og_image_url)).slice(0, 2)
}, [articles])

// グリッド: ヒーロー記事を除いた残り全件
const gridArticles = useMemo(() => {
  const heroIds = new Set(heroArticles.map(a => a.id))
  return articles.filter(a => !heroIds.has(a.id))
}, [articles, heroArticles])
```

> **注**: `heroArticles` はフィルタ条件（`Boolean(og_image_url)` — null, undefined, 空文字を除外）＋先頭2件。`gridArticles` はヒーローとして選ばれなかった**全記事**（画像あり/なし混在）。つまり、3番目以降の画像あり記事は通常グリッドに画像ありカードとして表示される。

---

## 4. 無限スクロール設計

### Intersection Observer + fetch ロジック

**パターン**: Sentinel要素 + useEffect

**useEffect（Intersection Observer）**:

```typescript
useEffect(() => {
  const sentinel = sentinelRef.current
  if (!sentinel) return

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !isLoading && hasMore) {
        loadMore()
      }
    },
    {
      threshold: 0,
      rootMargin: '0px 0px 300px 0px',  // 画面下300px手前で発火
    }
  )

  observer.observe(sentinel)
  return () => observer.disconnect()
}, [isLoading, hasMore])
```

**`rootMargin: '0px 0px 300px 0px'`** の根拠:
- MDN Intersection Observer API 公式ドキュメントのベストプラクティス
- 300px = 約1〜2カード分の高さ。ユーザーが底部に到達する前にfetchを開始し、体感的なローディング待ちを最小化

**loadMore関数**:

```typescript
const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || ''

async function loadMore() {
  setIsLoading(true)
  try {
    const nextPage = page + 1
    const res = await fetch(
      `${sseUrl}/articles?page=${nextPage}&per_page=${perPage}`,
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) throw new Error('Failed to fetch')
    const data: ArticleListResponse = await res.json()

    // SSE新着との重複排除（IDベース）
    const newArticles = data.items.filter(a => !knownIds.current.has(a.id))
    newArticles.forEach(a => knownIds.current.add(a.id))

    // setArticlesのprevコールバック内でknownIds.current.sizeを使い、
    // staleなクロージャ参照を回避
    setArticles(prev => {
      const merged = [...prev, ...newArticles]
      // 全件取得完了チェック（prevの最新長を使用）
      if (data.items.length < perPage || merged.length >= data.total) {
        setHasMore(false)
      }
      return merged
    })
    setPage(nextPage)
  } catch (error) {
    console.error('Failed to load more articles:', error)
    // エラー時はhasMoreを変更しない（リトライ可能にする）
  } finally {
    setIsLoading(false)
  }
}
```

**クライアントサイドfetchのURL**:
- 無限スクロールはClient Componentで実行されるため、**クライアントサイドから直接APIにfetch**する必要がある
- `NEXT_PUBLIC_SSE_URL` 環境変数を再利用（SSEとAPIは同一オリジン）
- ベースURL変数: `const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || ''`（SSE接続と共有）
- 既存SSE接続: `${sseUrl}/articles/stream`
- 無限スクロールfetch: `${sseUrl}/articles?page=N&per_page=20`

> **注**: `API_URL` はサーバーサイド専用（Docker内部ネットワーク）。クライアントからのfetchには `NEXT_PUBLIC_SSE_URL`（公開URL）を使用する。これは既存のSSE接続と同じURL体系。

### SSEとの共存

**SSE新着記事の処理（既存ロジックを維持）**:

```typescript
es.addEventListener('new_article', (e: MessageEvent) => {
  const article: ArticleListItem = JSON.parse(e.data)
  // 重複チェック
  if (knownIds.current.has(article.id)) return
  knownIds.current.add(article.id)
  setArticles(prev => [article, ...prev])
  setNewCount(c => c + 1)
})
```

**重複排除の仕組み**:
- `knownIds` (Set<string>) で全既知記事IDを管理
- SSEで追加された記事のIDを `knownIds` に登録
- 無限スクロールで取得した記事のうち、`knownIds` に存在するものはスキップ
- これにより、SSEで先頭に追加された記事が、後続ページfetchで重複表示されることを防止

**タイミング図**:

```
初回ロード:       [1,2,3,...,20] ← page=1 (サーバーサイド)
SSE新着:          [21] → [21,1,2,...,20]
無限スクロール:    page=2 → [22,23,...,40] (21はknownIdsで除外)
SSE新着:          [41] → [41,21,1,2,...,40]
無限スクロール:    page=3 → [42,43,...,60] (41はknownIdsで除外)
```

---

## 5. ローディングインジケーター

### スケルトンカード

無限スクロールのローディング中は、スケルトンカードを表示する。

**デザイン**:
```
┌─────────────────────────────┐
│  ████████████████████████   │  ← bg-gray-200 animate-pulse
│  ████████████████████████   │     aspect-ratio: 16/9
├─────────────────────────────┤
│ ██████                      │  ← 短いバー（カテゴリ位置）
│ ████████████████████        │  ← 長いバー（タイトル位置）
│ ██████████████████████████  │  ← 中バー×2（サマリー位置）
│ ██████████████████████████  │
│ ████████                    │  ← 短いバー（メタ情報位置）
└─────────────────────────────┘
```

**実装**: グリッドと同じ `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` で3枚のスケルトンカードを表示

```typescript
function LoadingIndicator() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white">
          <div className="aspect-video bg-gray-200 rounded-t-xl" />
          <div className="p-4 space-y-3">
            <div className="h-3 w-16 rounded bg-gray-200" />
            <div className="h-5 w-3/4 rounded bg-gray-200" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-gray-200" />
              <div className="h-3 w-5/6 rounded bg-gray-200" />
            </div>
            <div className="h-3 w-1/3 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## 6. ユーティリティ関数

### 6.1 formatRelativeTime（新規）

**ファイル**: `frontend/src/lib/formatRelativeTime.ts`

**目的**: 公開日時を日本語の相対時間で表示

**技術的根拠**: `Intl.RelativeTimeFormat` はブラウザ標準API（Chrome 71+, Firefox 65+, Safari 14+）。ポリフィル不要。（[MDN公式ドキュメント](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat)）

**ロジック**:

```typescript
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

const rtf = new Intl.RelativeTimeFormat('ja', {
  numeric: 'auto',
  style: 'long',
})

export function formatRelativeTime(dateInput: string | null): string {
  if (!dateInput) return ''
  const date = new Date(dateInput)
  if (isNaN(date.getTime())) return ''

  let duration = (date.getTime() - Date.now()) / 1000

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }

  return rtf.format(Math.round(duration), 'year')
}
```

**出力例**:
| 経過時間 | 出力 |
|---|---|
| 30秒前 | `30 秒前` |
| 5分前 | `5 分前` |
| 3時間前 | `3 時間前` |
| 昨日 | `昨日` |
| 3日前 | `3 日前` |
| 先週 | `先週` |
| 先月 | `先月` |
| 昨年 | `昨年` |

---

## 7. レスポンシブデザイン仕様

### レイアウト概要図

**デスクトップ (≥ 1024px)**:
```
┌───────────────────────────────────────────────────┐
│                    Header                         │
├───────────────────────────────────────────────────┤
│                                                   │
│  最新のテックニュース                    全120件   │
│                                                   │
│  ┌─────────────────┐  ┌─────────────────┐        │
│  │  ヒーロー記事1   │  │  ヒーロー記事2   │        │
│  │  (大画像+テキスト)│  │  (大画像+テキスト)│        │
│  └─────────────────┘  └─────────────────┘        │
│  ─────────────────────────────────────            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Card 3  │  │ Card 4  │  │ Card 5  │          │
│  │ (画像有)│  │ (テキスト)│  │ (画像有)│          │
│  └─────────┘  └─────────┘  └─────────┘          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Card 6  │  │ Card 7  │  │ Card 8  │          │
│  └─────────┘  └─────────┘  └─────────┘          │
│               ... (無限スクロール) ...             │
│  ┌─ ─ ─ ─ ┐  ┌─ ─ ─ ─ ┐  ┌─ ─ ─ ─ ┐          │
│  │skeleton │  │skeleton │  │skeleton │  ← loading│
│  └─ ─ ─ ─ ┘  └─ ─ ─ ─ ┘  └─ ─ ─ ─ ┘          │
├───────────────────────────────────────────────────┤
│                    Footer                         │
└───────────────────────────────────────────────────┘
```

**タブレット (768px - 1023px)**:
```
┌─────────────────────────────────┐
│            Header               │
├─────────────────────────────────┤
│                                 │
│  ┌────────────┐ ┌────────────┐ │
│  │  ヒーロー1  │ │  ヒーロー2  │ │
│  └────────────┘ └────────────┘ │
│  ─────────────────────────────  │
│  ┌────────────┐ ┌────────────┐ │
│  │  Card 3    │ │  Card 4    │ │
│  └────────────┘ └────────────┘ │
│  ┌────────────┐ ┌────────────┐ │
│  │  Card 5    │ │  Card 6    │ │
│  └────────────┘ └────────────┘ │
│            ...                  │
├─────────────────────────────────┤
│            Footer               │
└─────────────────────────────────┘
```

**モバイル (< 768px)**:
```
┌──────────────────────┐
│       Header         │
├──────────────────────┤
│                      │
│  ┌──────────────────┐│
│  │   ヒーロー1      ││
│  └──────────────────┘│
│  ┌──────────────────┐│
│  │   ヒーロー2      ││
│  └──────────────────┘│
│  ──────────────────── │
│  ┌──────────────────┐│
│  │   Card 3         ││
│  └──────────────────┘│
│  ┌──────────────────┐│
│  │   Card 4         ││
│  └──────────────────┘│
│         ...          │
├──────────────────────┤
│       Footer         │
└──────────────────────┘
```

### Tailwindブレークポイントマッピング

| 要件書 | Tailwind | 値 |
|---|---|---|
| モバイル (< 768px) | デフォルト | - |
| タブレット (768px - 1023px) | `md:` | 768px |
| デスクトップ (≥ 1024px) | `lg:` | 1024px |

### コンテナ幅

- 既存: `max-w-5xl` (1024px) は**維持**
- `layout.tsx` の変更は不要
- デスクトップ3カラムの場合、各カラム幅: `(1024 - 48px gap×2 - 32px padding×2) / 3 ≈ 296px`

---

## 8. カラースキーム・スタイル詳細

要件書に従い、既存のグレー基調を維持。

### カード

| 要素 | Tailwindクラス | 値 |
|---|---|---|
| 背景 | `bg-white` | #ffffff |
| ボーダー | `border border-gray-200` | #e5e7eb |
| 角丸 | `rounded-xl` | 12px |
| ホバーシャドウ | `hover:shadow-lg` | large shadow |
| トランジション | `transition-shadow duration-200` | 200ms |
| 画像角丸（上部） | `rounded-t-xl` | 12px (top only) |
| テキストパディング | `p-4` | 16px |

### テキスト

| 要素 | Tailwindクラス | 用途 |
|---|---|---|
| タイトル（通常） | `text-lg font-semibold text-gray-900` | カードタイトル |
| タイトル（ヒーロー） | `text-xl font-bold text-gray-900` | ヒーロータイトル |
| サマリー | `text-sm text-gray-600 line-clamp-3` | 本文プレビュー |
| メタ情報 | `text-xs text-gray-500` | ソース・著者・日時 |
| カテゴリバッジ | `text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600` | タグ |
| 件数表示 | `text-sm text-gray-500` | 全N件表示 |
| 終端メッセージ | `text-sm text-gray-400` | すべての記事を表示しました |
| 新着バッジ | `text-sm text-blue-600` | N件の新着記事 |

### ダークモード対応

現状、`globals.css` でCSS変数によるダークモード対応が定義されているが、Tailwindのユーティリティクラスは明示的なダークモード指定をしていない（OS設定に依存するCSS変数のみ）。

**本設計ではダークモードは対象外**とし、既存の挙動を維持する。将来的にダークモード対応が必要な場合は、Tailwindの `dark:` プレフィックスを追加する別タスクとする。

---

## 9. ファイル変更一覧

### 改修ファイル

| ファイル | 変更内容 | 変更量 |
|---|---|---|
| `components/ArticleCard.tsx` | アダプティブカードに全面改修（画像あり/なし分岐、相対時間、新スタイル） | 大 |
| `components/ArticleListLive.tsx` | 無限スクロール、ヒーロー/グリッド分離、重複排除、ローディング表示 | 大 |
| `app/page.tsx` | `ArticleListLive` の props 拡張に合わせて `initialPage`, `perPage` を追加 | 小 |
| `app/articles/page.tsx` | 同上 | 小 |

### 新規ファイル

| ファイル | 内容 | サイズ |
|---|---|---|
| `components/ArticleImage.tsx` | next/image ラッパー（fill + onError フォールバック） | 小 |
| `components/HeroSection.tsx` | ヒーローセクション（2カラム大型カード） | 中 |
| `components/ArticleGrid.tsx` | レスポンシブグリッドコンテナ | 小 |
| `lib/formatRelativeTime.ts` | 日本語相対時間ユーティリティ | 小 |

### 変更なし

| ファイル | 理由 |
|---|---|
| `app/layout.tsx` | max-w-5xl 維持、変更不要 |
| `app/globals.css` | Tailwindユーティリティのみで完結、追加CSS不要 |
| `lib/types.ts` | 既存の `ArticleListItem`, `ArticleListResponse` をそのまま使用 |
| `lib/api.ts` | サーバーサイドfetchは既存のまま。クライアントfetchは `ArticleListLive` 内に直接実装 |
| `next.config.ts` | `remotePatterns` は `https://**` で全外部画像を許可済み |
| API側全体 | APIの変更は不要 |

---

## 10. データフロー図

### 初回ロード

```
Browser → Next.js Server (app/page.tsx)
              │
              ├─ getArticles(1) → API (GET /articles?page=1&per_page=20)
              │                    └─ 200 { items: [...], total: 120, page: 1, per_page: 20 }
              │
              └─ SSR Render
                   ├─ <HeroSection articles={画像あり先頭2件} />
                   ├─ <ArticleGrid articles={残り記事} />
                   └─ <div ref={sentinel} />
                        │
Browser ← HTML (hydrate) │
              │           │
              ├─ SSE接続開始 (EventSource /articles/stream)
              └─ Intersection Observer 監視開始
```

### 無限スクロール

```
[sentinel enters viewport (rootMargin: 300px)]
    │
    ├─ isLoading=true → スケルトンカード表示
    │
    ├─ Client fetch: GET /articles?page=2&per_page=20
    │                 └─ 200 { items: [...], total: 120, page: 2, per_page: 20 }
    │
    ├─ 重複排除: items.filter(a => !knownIds.has(a.id))
    │
    ├─ articles = [...prev, ...newArticles]
    │
    ├─ <ArticleGrid> 再レンダリング（追加分のカードが末尾に表示）
    │
    └─ isLoading=false → スケルトン非表示
```

### SSE新着記事

```
[SSE: new_article event]
    │
    ├─ 重複チェック: knownIds.has(article.id) → skip or add
    │
    ├─ articles = [newArticle, ...prev]
    │
    ├─ newCount++
    │
    └─ ヒーロー/グリッド再計算（useMemo依存配列により自動）
        ├─ 新記事が画像ありなら、ヒーローが更新される可能性あり
        └─ 元のヒーロー記事はグリッドに移動
```

---

## 11. エッジケース対処

| ケース | 対処 |
|---|---|
| 画像あり記事が0件 | `HeroSection` を非表示、区切り線も非表示、`ArticleGrid` のみ表示 |
| 画像あり記事が1件 | `HeroSection` は1カラムフル幅で1枚のみ表示 |
| OG画像URLが404 | `ArticleImage` の `onError` → 親にコールバック → テキスト専用カードにフォールバック |
| SSE新着が画像あり | ヒーロー記事が入れ替わる（`useMemo` が `articles` 依存で再計算） |
| 全記事読み込み完了 | `hasMore=false` → sentinel 非表示、「すべての記事を表示しました」メッセージ表示 |
| fetch失敗（ネットワークエラー） | `isLoading=false` に戻す、`hasMore` は変更しない（次回スクロールでリトライ） |
| SSE + 無限スクロールの重複 | `knownIds` Set で IDベースの重複排除 |
| 記事が0件 | 「まだ記事がありません。」メッセージ（既存動作を維持） |
| `published_at` が null | `formatRelativeTime` が空文字を返す → メタ情報から日時を省略 |

---

## 12. パフォーマンス考慮事項

| 項目 | 対策 |
|---|---|
| 画像の遅延読み込み | `next/image` デフォルト `loading="lazy"` を使用。ヒーロー画像のみ `loading="eager"` |
| 画像サイズ最適化 | `sizes` 属性でビューポートに応じた適切なサイズをブラウザに指示 |
| 不要な再レンダリング | `useMemo` でヒーロー/グリッド分離をメモ化 |
| ページサイズ | 既存の 20件/ページ を維持 |
| fetch タイムアウト | `AbortSignal.timeout(10_000)` で10秒タイムアウト |
| スケルトンUI | データ取得中の体感速度改善 |

---

## 13. アクセシビリティ

| 項目 | 実装 |
|---|---|
| セマンティックHTML | `<article>`, `<time>`, `<section aria-label="...">` を使用 |
| 画像alt属性 | `alt={article.title_ja || 'article image'}` |
| キーボードナビゲーション | `<Link>` 要素によるフォーカス可能なカード（既存動作を維持） |
| ローディング状態 | `aria-busy="true"` をグリッドセクションに付与（ローディング中） |
| 色のコントラスト | 既存のgray-900/gray-600/gray-500の階層を維持（WCAG AA準拠） |

---

## 14. 既存SSE機能との互換性

| 既存機能 | 本設計での扱い |
|---|---|
| `EventSource` 接続 | **維持** — 同じURLパターン、同じイベントリスナー |
| `new_article` イベント | **維持** — 先頭に追加するロジックはそのまま |
| `newCount` バッジ | **維持** — 「N件の新着記事」表示 |
| Visibility Change 再接続 | **維持** — タブ非表示時に切断、復帰時に再接続 |
| 追加点 | `knownIds` による重複排除のみ新規追加 |

---

## 15. 次のステップ

1. **設計レビュー** → 本設計書に対するフィードバック・承認
2. **実装** → 承認後、feature branch を作成して実装開始
3. **テスト** → ビジュアル確認 + レスポンシブ動作確認
