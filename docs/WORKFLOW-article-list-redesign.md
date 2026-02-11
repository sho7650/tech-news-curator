# 記事一覧リデザイン 実装ワークフロー

> Design: `docs/DESIGN-article-list-redesign.md` (v1.0, レビュー済み)
> Date: 2026-02-11
> Strategy: systematic (依存関係順の逐次実装)

---

## 依存関係グラフ

```
Phase 1 (依存なし — 並行実装可能)
├── [1-1] lib/formatRelativeTime.ts     ← 新規ユーティリティ
└── [1-2] components/ArticleImage.tsx    ← 新規コンポーネント

Phase 2 (Phase 1 に依存)
├── [2-1] components/ArticleCard.tsx     ← 全面改修 (depends: 1-1, 1-2)
└── [2-2] components/HeroSection.tsx     ← 新規 (depends: 1-2)

Phase 3 (Phase 2 に依存)
└── [3-1] components/ArticleGrid.tsx     ← 新規 (depends: 2-1)

Phase 4 (Phase 1〜3 全てに依存)
└── [4-1] components/ArticleListLive.tsx ← 大幅改修 (depends: 2-2, 3-1)

Phase 5 (Phase 4 に依存)
└── [5-1] app/page.tsx + app/articles/page.tsx ← props変更 (depends: 4-1)

Phase 6 (全Phase完了後)
└── [6-1] 動作確認・レスポンシブテスト
```

---

## Phase 0: 準備

### [0-1] feature branch 作成

- **操作**: `git checkout -b feature/article-list-redesign`
- **チェックポイント**: ブランチ作成完了、main から最新状態

---

## Phase 1: 基盤コンポーネント（並行実装可能）

### [1-1] `lib/formatRelativeTime.ts` — 新規作成

**ファイル**: `frontend/src/lib/formatRelativeTime.ts`

**実装内容**:
- `Intl.RelativeTimeFormat('ja', { numeric: 'auto', style: 'long' })` ベース
- `DIVISIONS` 配列で秒→分→時→日→週→月→年を段階的に判定
- `formatRelativeTime(dateInput: string | null): string`
- null / 不正日付に対して空文字を返す

**入力**: 設計書 §6.1 のロジックをそのまま実装

**検証**:
- [ ] `formatRelativeTime(null)` → `''`
- [ ] `formatRelativeTime('invalid')` → `''`
- [ ] 30秒前の日時文字列 → `'30 秒前'`
- [ ] 昨日の日時文字列 → `'昨日'`

---

### [1-2] `components/ArticleImage.tsx` — 新規作成

**ファイル**: `frontend/src/components/ArticleImage.tsx`

**実装内容**:
- `"use client"` ディレクティブ（`onError` が必要）
- Props: `{ src, alt, sizes, eager?, onImageError? }`
- `next/image` の `fill` + `object-fit: cover`
- 親コンテナ: `relative aspect-video` (16:9)
- 内部 state `hasError`
  - `onError` → `setHasError(true)` + `onImageError?.()` 呼出
  - `hasError === true` → `return null`
- `eager={true}` → `loading="eager"`, それ以外 → `loading="lazy"`（デフォルト）
- 画像角丸: `rounded-t-xl`

**検証**:
- [ ] 有効な画像URLで正常表示
- [ ] 存在しないURLで `onError` 発火 → `null` 返却
- [ ] `onImageError` コールバックが親に通知される

---

## Phase 2: カードコンポーネント

### [2-1] `components/ArticleCard.tsx` — 全面改修

**ファイル**: `frontend/src/components/ArticleCard.tsx`
**依存**: [1-1] formatRelativeTime, [1-2] ArticleImage

**実装内容**:
- Props は既存の `{ article: ArticleListItem }` のまま
- 内部 state `imageError` (boolean)
- 条件分岐: `Boolean(article.og_image_url) && !imageError`
  - **true**: 画像ありカード — `ArticleImage` + テキスト情報
  - **false**: テキスト専用カード — テキスト情報のみ
- カードスタイル: `rounded-xl border border-gray-200 bg-white hover:shadow-lg transition-shadow duration-200`
- 画像: エッジtoエッジ（パディングなし）、`rounded-t-xl`
- テキスト部分: `p-4`
- カテゴリバッジ: `text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600`
- タイトル: `text-lg font-semibold text-gray-900 line-clamp-2`
- サマリー: `text-sm text-gray-600 line-clamp-3`
- メタ情報: `text-xs text-gray-500`、中黒 `·` 区切り
- 日時: `formatRelativeTime(article.published_at)`
- カード全体を `<Link>` で囲む
- `<article>` タグ維持

**検証**:
- [ ] `og_image_url` あり → 画像カード表示
- [ ] `og_image_url` なし → テキストカード表示
- [ ] `og_image_url` が空文字 → テキストカード表示
- [ ] 画像読み込みエラー → テキストカードにフォールバック
- [ ] 相対時間の正常表示
- [ ] ホバー時のシャドウ変化

---

### [2-2] `components/HeroSection.tsx` — 新規作成

**ファイル**: `frontend/src/components/HeroSection.tsx`
**依存**: [1-2] ArticleImage

**実装内容**:
- Props: `{ articles: ArticleListItem[] }`（最大2件、画像あり前提）
- `articles.length === 0` → `return null`（セクション非表示）
- グリッド: `grid grid-cols-1 md:grid-cols-2 gap-6`
  - 1件の場合: `grid-cols-1` のみ（フル幅）
- 各ヒーローカード:
  - 内部 state `imageError`
  - `ArticleImage` with `eager={true}`, `sizes="(max-width: 768px) 100vw, 50vw"`
  - エラー時: 画像セクション非表示、テキスト専用ヒーロー（カード枠は維持）
  - タイトル: `text-xl font-bold text-gray-900`
  - サマリー: `text-sm text-gray-600 line-clamp-2`
  - カード全体を `<Link>` で囲む
  - カードスタイル: `rounded-xl border border-gray-200 bg-white hover:shadow-lg transition-shadow duration-200`

**検証**:
- [ ] 2件 → 2カラム表示
- [ ] 1件 → フル幅表示
- [ ] 0件 → セクション非表示（`null`）
- [ ] ヒーロー画像エラー → テキスト専用ヒーローにフォールバック

---

## Phase 3: グリッドコンテナ

### [3-1] `components/ArticleGrid.tsx` — 新規作成

**ファイル**: `frontend/src/components/ArticleGrid.tsx`
**依存**: [2-1] ArticleCard

**実装内容**:
- Props: `{ articles: ArticleListItem[] }`
- `articles.length === 0` → `return null`
- `<section aria-label="記事一覧">`
- グリッド: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- 各記事に `<ArticleCard>` をレンダリング

**検証**:
- [ ] 記事0件 → 非表示
- [ ] モバイル → 1カラム
- [ ] タブレット → 2カラム
- [ ] デスクトップ → 3カラム
- [ ] 画像あり/なしカードの混在表示

---

## Phase 4: メインコンポーネント改修

### [4-1] `components/ArticleListLive.tsx` — 大幅改修

**ファイル**: `frontend/src/components/ArticleListLive.tsx`
**依存**: [2-2] HeroSection, [3-1] ArticleGrid, Phase 1 全て

**実装内容**:

#### 4-1a: Props拡張

```typescript
interface Props {
  initialArticles: ArticleListItem[]
  total: number
  initialPage: number  // 追加
  perPage: number      // 追加
}
```

#### 4-1b: State追加

- 既存: `articles`, `newCount`, `esRef`
- 追加: `page`, `isLoading`, `hasMore`, `sentinelRef`, `knownIds`
- 削除: なし（`totalCount` は不使用）

#### 4-1c: ヒーロー/グリッド分離 (useMemo)

- `heroArticles`: `articles.filter(a => Boolean(a.og_image_url)).slice(0, 2)`
- `gridArticles`: `articles.filter(a => !heroIds.has(a.id))`

#### 4-1d: Intersection Observer (useEffect)

- `sentinelRef` を監視
- `threshold: 0`, `rootMargin: '0px 0px 300px 0px'`
- `isIntersecting && !isLoading && hasMore` → `loadMore()`
- cleanup: `observer.disconnect()`

#### 4-1e: loadMore関数

- `sseUrl` ベースでクライアントfetch
- `AbortSignal.timeout(10_000)`
- `knownIds` で重複排除
- `setArticles(prev => ...)` コールバック内で `hasMore` 判定
- エラー時は `hasMore` 変更なし（リトライ可能）

#### 4-1f: SSE既存ロジックに重複排除を追加

- `knownIds.current.has(article.id)` → skip
- `knownIds.current.add(article.id)` → 登録

#### 4-1g: レンダリング構造

- 新着バッジ（インライン `<p>`）
- 全件数: `articles.length`
- `<HeroSection>`
- 区切り線（ヒーローがある場合のみ）
- `<ArticleGrid>`
- `<LoadingIndicator>`（スケルトン3枚、ローカル関数として定義）
- 終端メッセージ
- sentinel `<div>`

**検証**:
- [ ] 初回ロード: ヒーロー + グリッド表示
- [ ] 無限スクロール: sentinel接近でページ2取得
- [ ] SSE新着: 先頭に追加、ヒーロー再計算
- [ ] SSE + 無限スクロール重複排除
- [ ] 全件読み込み完了時の終端メッセージ
- [ ] ネットワークエラー時のリトライ
- [ ] スケルトンカード表示/非表示

---

## Phase 5: ページコンポーネント更新

### [5-1] `app/page.tsx` + `app/articles/page.tsx` — props追加

**ファイル**:
- `frontend/src/app/page.tsx`
- `frontend/src/app/articles/page.tsx`

**依存**: [4-1] ArticleListLive

**実装内容** (両ファイル同一の変更):
- `<ArticleListLive>` に `initialPage={1}` と `perPage={20}` を追加

**変更前**:
```tsx
<ArticleListLive initialArticles={data.items} total={data.total} />
```

**変更後**:
```tsx
<ArticleListLive
  initialArticles={data.items}
  total={data.total}
  initialPage={1}
  perPage={20}
/>
```

**検証**:
- [ ] `app/page.tsx`: TypeScriptエラーなし
- [ ] `app/articles/page.tsx`: TypeScriptエラーなし
- [ ] 両ページで初回ロード正常

---

## Phase 6: 検証

### [6-1] 動作確認

**前提**: `make dev` でDockerコンテナ起動

#### 機能テスト

| テスト項目 | 確認内容 |
|---|---|
| ヒーロー表示 | 画像あり記事が最大2件大きく表示される |
| ヒーロー非表示 | 画像あり記事が0件の場合、セクションがスキップされる |
| アダプティブカード | 画像あり/なしでカードデザインが切り替わる |
| 画像エラー | 404画像がテキストカードにフォールバックする |
| 無限スクロール | ページ底部で次の20件が自動取得される |
| スケルトン表示 | 読み込み中にスケルトンカード3枚が表示される |
| 終端メッセージ | 全記事取得後に「すべての記事を表示しました」が表示される |
| SSE新着 | 新着記事がリスト先頭に追加される |
| SSE重複排除 | SSE新着が無限スクロールfetchで重複しない |
| 相対時間 | 公開日時が「3時間前」「昨日」等で表示される |

#### レスポンシブテスト

| ブレークポイント | 確認内容 |
|---|---|
| モバイル (< 768px) | ヒーロー1カラム、グリッド1カラム |
| タブレット (768-1023px) | ヒーロー2カラム、グリッド2カラム |
| デスクトップ (≥ 1024px) | ヒーロー2カラム、グリッド3カラム |

#### TypeScript / ビルドチェック

- [ ] `npx tsc --noEmit` — 型エラーなし
- [ ] `npm run build` — ビルド成功

---

## 実装順序サマリー

```
[0-1] Branch作成
  ↓
[1-1] formatRelativeTime ─┐
[1-2] ArticleImage ───────┤ (並行可能)
  ↓                       ↓
[2-1] ArticleCard ────────┐
[2-2] HeroSection ────────┤ (並行可能)
  ↓                       ↓
[3-1] ArticleGrid ────────┤
  ↓                       ↓
[4-1] ArticleListLive ────┤
  ↓                       ↓
[5-1] page.tsx 更新 ──────┤
  ↓                       ↓
[6-1] 動作確認
```

**合計**: 新規4ファイル + 改修4ファイル + 検証
**API変更**: なし
**依存追加**: なし（全てNext.js 16 / React 19 / Tailwind v4 の標準機能）
