# DESIGN: ニュースレイアウト改善

**Version**: 1.1
**Date**: 2026-03-11
**Status**: Draft — レビュー待ち (v1.1: Spec Panel フィードバック反映)

## 1. 概要

ワイドディスプレイでの左右余白を有効活用し、記事詳細ページの読了体験を向上させる。

### 変更スコープ

| ID | 変更内容 | 影響範囲 |
|----|---------|---------|
| **L-1** | グローバルコンテナ幅を `max-w-5xl` → `max-w-7xl` に拡張 | layout.tsx, Header, Footer |
| **L-2** | 記事一覧を4カラムグリッドに変更 | ArticleGrid, HeroSection, ArticleListLive |
| **L-3** | スティッキータイトルバー（スクロール時にフェードイン） | 新規コンポーネント |
| **L-4** | 右サイドバー拡張（TOC + 関連記事） | 記事詳細ページ, TOC, 新規コンポーネント |
| **L-5** | 前後記事ナビゲーション | 新規コンポーネント, 新規APIエンドポイント |

---

## 2. API設計

### 2.1 関連記事の取得

**新規エンドポイント不要** — 既存の `GET /articles?category=X&per_page=6` をフロントエンドの Server Component から呼び出し、現在の記事を除外する。

```
フロントエンド Server Component:
  getArticles(1, category) → items → filter(id !== currentId) → slice(0, 5)
```

**理由**: 同カテゴリの最新記事取得は既存APIで十分。専用エンドポイントの追加はオーバーエンジニアリング。

### 2.2 前後記事の取得

**新規エンドポイント**: `GET /articles/:article_id/neighbors`

既存APIでは `published_at` の前後1件を効率的に取得できないため、専用エンドポイントが必要。

#### リクエスト

```
GET /articles/:article_id/neighbors
```

- パスパラメータ: `article_id` (UUID) — 既存の `uuidParamSchema` を再利用

#### レスポンス (200)

```json
{
  "prev": {
    "id": "uuid",
    "title_ja": "前の記事タイトル",
    "og_image_url": "https://...",
    "published_at": "2026-03-10T12:00:00Z"
  },
  "next": {
    "id": "uuid",
    "title_ja": "次の記事タイトル",
    "og_image_url": "https://...",
    "published_at": "2026-03-11T08:00:00Z"
  }
}
```

- `prev`: 時系列で1つ前の記事（`published_at` が小さい方向）。なければ `null`
- `next`: 時系列で1つ後の記事。なければ `null`
- レスポンス型は `ArticleListItem` のサブセット（`id`, `title_ja`, `og_image_url`, `published_at`）

#### レスポンス (404)

```json
{ "detail": "Article not found" }
```

#### SQLクエリ設計

```sql
-- prev: 現在の記事より published_at が古い中で最も新しい1件
-- tiebreaker: 同一 published_at の場合は created_at DESC で安定したソート
SELECT id, title_ja, og_image_url, published_at
FROM articles
WHERE (published_at < $current_published_at
       OR (published_at = $current_published_at AND created_at < $current_created_at))
  AND id != $current_id
ORDER BY published_at DESC NULLS LAST, created_at DESC
LIMIT 1;

-- next: 現在の記事より published_at が新しい中で最も古い1件
SELECT id, title_ja, og_image_url, published_at
FROM articles
WHERE (published_at > $current_published_at
       OR (published_at = $current_published_at AND created_at > $current_created_at))
  AND id != $current_id
ORDER BY published_at ASC NULLS LAST, created_at ASC
LIMIT 1;
```

既存の `ix_articles_published_at` インデックスを使用するため、追加インデックス不要。

**Note**: n8n が複数記事を同時取り込みすると同一 `published_at` が発生するため、`created_at` を tiebreaker として使用し、結果を決定的にする。

---

## 3. バックエンド実装設計

### 3.1 article-service.ts — 新規関数

```typescript
// 前後記事の型（ArticleListItemのサブセット）
interface ArticleNeighbor {
  id: string;
  titleJa: string | null;
  ogImageUrl: string | null;
  publishedAt: Date | null;
}

interface ArticleNeighbors {
  prev: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
}

async function getArticleNeighbors(
  db: DB,
  articleId: string,
): Promise<ArticleNeighbors | null>
```

**処理フロー**:
1. `getArticleById` で対象記事の `published_at` と `created_at` を取得
2. 記事が存在しない → `null` を返す
3. `published_at` が `null` → `{ prev: null, next: null }` を返す
4. 2つのクエリを `Promise.all` で並列実行（prev, next）
5. 結果を `ArticleNeighbors` として返す

**tiebreaker**: 同一 `published_at` の記事が複数存在する場合、`created_at` をセカンダリソートキーとして使用し、結果を決定的にする。

### 3.2 articles.ts (routes) — 新規ルート

```
GET /articles/:article_id/neighbors
```

- `createRateLimiter(200)` — 記事詳細と同じレート
- `uuidParamSchema` でパスパラメータをバリデーション
- `getArticleNeighbors` を呼び出し、`null` なら 404

### 3.3 article.ts (schemas) — 新規レスポンス型

```typescript
interface ArticleNeighborItem {
  id: string;
  title_ja: string | null;
  og_image_url: string | null;
  published_at: string | null;
}

interface ArticleNeighborsResponse {
  prev: ArticleNeighborItem | null;
  next: ArticleNeighborItem | null;
}
```

---

## 4. フロントエンド実装設計

### 4.1 グローバルレイアウト変更 (L-1)

#### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `app/layout.tsx` | `<main>` の `max-w-5xl` → `max-w-7xl` |
| `components/Header.tsx` | `<nav>` の `max-w-5xl` → `max-w-7xl` |
| `components/Footer.tsx` | `<div>` の `max-w-5xl` → `max-w-7xl` |

### 4.2 記事一覧4カラム化 (L-2)

#### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `components/ArticleGrid.tsx` | `lg:grid-cols-3` → `lg:grid-cols-3 xl:grid-cols-4` |
| `components/HeroSection.tsx` | `lg:grid-cols-3` → `lg:grid-cols-3 xl:grid-cols-4`。先頭記事の `lg:col-span-2` は維持（4列中2列 = 50%幅、視覚的バランスは許容範囲） |
| `components/ArticleListLive.tsx` | LoadingIndicator のグリッドカラムも同様に `xl:grid-cols-4`、スケルトン数を 3→4 に |

#### ブレークポイント

| 画面幅 | カラム数 |
|--------|---------|
| ~768px | 1列 |
| 768px~1024px | 2列 |
| 1024px~1280px | 3列 |
| 1280px~ | 4列 |

### 4.3 スティッキータイトルバー (L-3)

#### 新規コンポーネント: `StickyArticleTitle.tsx`

**種別**: Client Component (`'use client'`)

**Props**:
```typescript
interface StickyArticleTitleProps {
  title: string;
  imageUrl: string | null;
}
```

**動作**:
1. `IntersectionObserver` でヒーロー画像（または `.sticky-title-trigger` として指定した要素）を監視
2. ヒーロー画像がビューポート外にスクロール → `isVisible = true`
3. ヒーロー画像が再びビューポートに入る → `isVisible = false`

**レイアウト** (ヘッダーの直下、ScrollProgressバーの下):
```
┌────────────────────────────────────────────────────────┐
│ [ScrollProgress bar - fixed top-0 z-50]                │
├────────────────────────────────────────────────────────┤
│ [Header - sticky top-0 z-50]                           │
├────────────────────────────────────────────────────────┤
│ [StickyArticleTitle - sticky z-40]                     │
│  ┌──────┐                                              │
│  │ 36px │  記事タイトル（1行、text-ellipsis）          │
│  │ img  │                                              │
│  └──────┘                                              │
└────────────────────────────────────────────────────────┘
```

**スタイル**:
- `sticky` positioning — Header の下に配置
- Header の高さ: `py-4` (16px×2) + コンテンツ行高 (約25px) = 約 57px。この値は Header の padding + フォントサイズから導出される安定値。実装時に `top-14` (56px, Tailwind の spacing scale) を使用し、微調整が必要な場合は `top-[57px]` にフォールバックする。
- `bg-bg-primary/80 backdrop-blur-md` (Header と統一)
- `border-b border-border`
- フェードイン/アウト: CSS `transition-opacity duration-300` + `opacity-0/100`
- `pointer-events-none` when hidden（下のクリック可能要素を邪魔しない）
- サムネイル: `36px × 36px`, `rounded`, `object-cover`。画像なしの場合はサムネイル自体を非表示（タイトルのみ表示）
- タイトル: `text-sm font-medium`, `truncate` (1行省略)
- 内部コンテナ: `max-w-7xl mx-auto px-4` (Header と統一)

**Props 拡張**:
```typescript
interface StickyArticleTitleProps {
  title: string;
  imageUrl: string | null;
  triggerId: string; // 監視対象要素のID
}
```

**トリガー**:
- 記事詳細ページのヒーロー画像に `id="hero-image"` を付与
- `IntersectionObserver` で `props.triggerId` の要素を監視
- IO オプション: `{ threshold: 0, rootMargin: '0px 0px 0px 0px' }` — 要素が完全にビューポート外に出たら発火
- 画像がない記事: カテゴリバッジセクション（`id="article-meta"`）を trigger とする。ユーザーがタイトルとメタ情報を自然に読み終えた後にフェードインする（h1 を trigger にするとスクロール直後に出現して煩わしい）

### 4.4 右サイドバー拡張 (L-4)

#### 記事詳細ページ `app/articles/[id]/page.tsx` の変更

**現在のレイアウト**:
```
<div className="flex gap-8">
  <div className="min-w-0 flex-1">本文</div>
  <div className="hidden w-56 shrink-0 lg:block">TOC</div>
</div>
```

**変更後**:
```
<div className="flex gap-8">
  <div className="min-w-0 flex-1">本文</div>
  <aside className="hidden w-72 shrink-0 lg:block">
    <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <TableOfContents contentId="article-content" />
      <RelatedArticles articles={relatedArticles} />
    </div>
  </aside>
</div>
```

- サイドバー幅: `w-56` (224px) → `w-72` (288px)
- `sticky` をサイドバー内部の wrapper に移動（TOC + 関連記事を一体でスクロール追従）
- `TableOfContents` から `sticky` 関連のクラスを除去（親が制御）

#### 新規コンポーネント: `RelatedArticles.tsx`

**種別**: Server Component（データは親ページから props で渡す）

**Props**:
```typescript
interface RelatedArticlesProps {
  articles: ArticleListItem[];
}
```

**レイアウト**:
```
┌───────────────────────┐
│ 関連記事               │
├───────────────────────┤
│ ┌────┐ タイトル（2行） │
│ │ img│ source · 3h ago │
│ └────┘                 │
├───────────────────────┤
│ ┌────┐ タイトル（2行） │
│ │ img│ source · 1d ago │
│ └────┘                 │
└───────────────────────┘
```

- 見出し: `関連記事` (`text-sm font-bold`, `mb-3`, `mt-6`)
- 区切り線: TOCと関連記事の間に `border-t border-border pt-4 mt-4`
- 各アイテム: `flex gap-3` 横並び
  - サムネイル: `48px × 48px`, `rounded`, `object-cover`, `shrink-0`
  - タイトル: `text-sm`, `line-clamp-2`
  - メタ: `text-xs text-text-muted`
- アイテム間: `space-y-3`
- リンク: `<Link href="/articles/{id}">` でラップ
- 画像なしの場合: `bg-bg-secondary rounded` の単色ブロック（48×48px）。アイコンなし、シンプルに統一
- 0件の場合: 関連記事セクション自体を非表示（`articles.length === 0` で `null` 返却）
- モバイル表示: サイドバー非表示時、本文 → 前後ナビ → 関連記事の順で縦積み表示（`lg:hidden` セクション）

#### データ取得（Server Component内）

記事詳細ページは3つのAPIコールが必要。`getArticleById` 完了後、残り2つを `Promise.all` で並列実行してレイテンシを最小化する。

```typescript
// app/articles/[id]/page.tsx 内

// 1. まず記事本体を取得（categories を得るために必須）
const article = await getArticleById(id);

// 2. 関連記事 + 前後ナビを並列で取得
const firstCategory = article.categories?.[0]; // 第1カテゴリを主カテゴリとして使用
const [relatedData, neighbors] = await Promise.all([
  firstCategory ? getArticles(1, firstCategory) : Promise.resolve(null),
  getArticleNeighbors(article.id),
]);
const relatedArticles = relatedData
  ? relatedData.items.filter((a) => a.id !== article.id).slice(0, 5)
  : [];
```

**設計判断**: 記事が複数カテゴリを持つ場合、第1カテゴリ（`categories[0]`）を主カテゴリとして関連記事を取得する。全カテゴリ OR 検索は将来的な拡張として検討可能だが、現時点ではシンプルさを優先する。

**関連記事の表示件数**: 最大5件。該当記事数が5未満の場合はすべて表示。0件の場合はセクション自体を非表示にする。

#### `TableOfContents.tsx` の変更

- Desktop の `<nav>` から `lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto` を除去
- これらのスタイルは親要素（サイドバーの wrapper `<div>` ）に移動
- TOC 内部の `IntersectionObserver`（`rootMargin: '-80px 0px -60% 0px'`）は親の sticky/overflow 変更の影響を受けない（IO の root はデフォルト viewport のため）

### 4.5 前後記事ナビゲーション (L-5)

#### 新規コンポーネント: `ArticleNavigation.tsx`

**種別**: Server Component（データは親ページから props で渡す）

**Props**:
```typescript
interface ArticleNavigationProps {
  prev: ArticleNeighborItem | null;
  next: ArticleNeighborItem | null;
}
```

**レイアウト** (デスクトップ):
```
┌──────────────────────┐  ┌──────────────────────┐
│  ← 前の記事           │  │          次の記事 →   │
│ ┌────┐               │  │              ┌────┐  │
│ │ img│ タイトル(2行)  │  │ タイトル(2行) │ img│  │
│ └────┘               │  │              └────┘  │
└──────────────────────┘  └──────────────────────┘
```

**レイアウト** (モバイル):
```
┌──────────────────────────┐
│  ← 前の記事               │
│ ┌────┐ タイトル(2行)      │
│ └────┘                    │
├──────────────────────────┤
│          次の記事 →        │
│        タイトル(2行)┌────┐│
│                     └────┘│
└──────────────────────────┘
```

**スタイル**:
- コンテナ: `grid grid-cols-1 gap-4 sm:grid-cols-2`, `mt-12 pt-8 border-t border-border`
- 各カード: `group flex items-center gap-3 rounded-xl border border-border bg-bg-card p-4 transition-all hover:shadow-md hover:scale-[1.01]`
- prev カード: `flex-row` (画像左)
- next カード: `flex-row-reverse text-right` (画像右)
- サムネイル: `64px × 64px`, `rounded-lg`, `object-cover`, `shrink-0`
- ラベル: `text-xs text-text-muted` ("← 前の記事" / "次の記事 →")
- タイトル: `text-sm font-medium line-clamp-2`
- 画像なし: `bg-bg-secondary rounded-lg` の単色ブロック（64×64px）。関連記事と統一したプレースホルダーパターン
- 片方だけの場合: `sm:col-start-1` (prev) / `sm:col-start-2` (next) で位置固定

**配置**: 記事本文の下、モバイル関連記事の上

#### データ取得

前後記事データは、セクション 4.4 のデータ取得で `Promise.all` 内で `getArticleNeighbors` として並列取得済み。

### 4.6 `lib/api.ts` — 新規関数

```typescript
interface ArticleNeighborItem {
  id: string;
  title_ja: string | null;
  og_image_url: string | null;
  published_at: string | null;
}

interface ArticleNeighborsResponse {
  prev: ArticleNeighborItem | null;
  next: ArticleNeighborItem | null;
}

export async function getArticleNeighbors(
  id: string
): Promise<ArticleNeighborsResponse> {
  const res = await fetch(`${API_BASE}/articles/${id}/neighbors`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { prev: null, next: null };
  return res.json();
}
```

### 4.7 `lib/types.ts` — 新規型

```typescript
export interface ArticleNeighborItem {
  id: string;
  title_ja: string | null;
  og_image_url: string | null;
  published_at: string | null;
}

export interface ArticleNeighborsResponse {
  prev: ArticleNeighborItem | null;
  next: ArticleNeighborItem | null;
}
```

---

## 5. 記事詳細ページ全体構成（変更後）

### 5.1 デスクトップレイアウト (lg+)

```
┌─ ScrollProgress (fixed top-0 z-50) ──────────────────────────────┐
├─ Header (sticky top-0 z-50) ─────────────────────────────────────┤
├─ StickyArticleTitle (sticky top-14 z-40, fade in/out) ───────────┤
│                                                                   │
│  ← 記事一覧に戻る                                                │
│                                                                   │
│  ┌────────────────────── hero image (id="hero-image") ─────────┐ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  タイトル (h1)                                                    │
│  source · author · date · 読了時間 · 元記事を読む                │
│  [category badges] (id="article-meta")                            │
│                                                                   │
│  ┌─────── 本文エリア ────────┐  ┌──── sidebar (w-72) ────┐      │
│  │ ┌─── 要約ボックス ──────┐ │  │ 目次                    │      │
│  │ └───────────────────────┘ │  │ ● セクション1           │      │
│  │                           │  │   ○ サブセクション      │      │
│  │ markdown body             │  │ ● セクション2           │      │
│  │ (max-w-prose)             │  │                         │      │
│  │                           │  │ ─────────────────────── │      │
│  │                           │  │ 関連記事 (最大5件)      │      │
│  │                           │  │ [img] タイトル          │      │
│  │                           │  │ [img] タイトル          │      │
│  │                           │  │ [img] タイトル          │      │
│  └───────────────────────────┘  └─────────────────────────┘      │
│                                                                   │
│  ───────────────────── border-t ──────────────────────────────── │
│  ┌── ← 前の記事 ──────────┐  ┌────────── 次の記事 → ──────────┐ │
│  │ [img] タイトル          │  │          タイトル [img]        │ │
│  └─────────────────────────┘  └────────────────────────────────┘ │
│                                                                   │
├─ Footer ─────────────────────────────────────────────────────────┤
```

### 5.2 モバイルレイアウト (~lg)

コンポーネントの表示順序（上から下）:

1. ← 記事一覧に戻る
2. ヒーロー画像
3. タイトル (h1)
4. メタ情報 + カテゴリ
5. 目次（折りたたみ `<details>`）
6. 要約ボックス
7. 記事本文
8. **前後記事ナビゲーション**（縦積み）
9. **関連記事セクション**（`lg:hidden`、サイドバー非表示時のフォールバック）

---

## 6. ファイル変更一覧

### バックエンド (api/src/)

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `services/article-service.ts` | 修正 | `getArticleNeighbors()` 追加 |
| `routes/articles.ts` | 修正 | `GET /articles/:article_id/neighbors` 追加 |
| `schemas/article.ts` | 修正 | `ArticleNeighborItem`, `ArticleNeighborsResponse` 型追加 |

### フロントエンド (frontend/src/)

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `app/layout.tsx` | 修正 | `max-w-5xl` → `max-w-7xl` |
| `components/Header.tsx` | 修正 | `max-w-5xl` → `max-w-7xl` |
| `components/Footer.tsx` | 修正 | `max-w-5xl` → `max-w-7xl` |
| `components/ArticleGrid.tsx` | 修正 | `xl:grid-cols-4` 追加 |
| `components/HeroSection.tsx` | 修正 | `xl:grid-cols-4` 追加 |
| `components/ArticleListLive.tsx` | 修正 | LoadingIndicator 4カラム対応 |
| `components/TableOfContents.tsx` | 修正 | Desktop の sticky 関連クラスを除去 |
| `components/StickyArticleTitle.tsx` | **新規** | スクロール時のスティッキータイトル |
| `components/RelatedArticles.tsx` | **新規** | サイドバー用の関連記事リスト |
| `components/ArticleNavigation.tsx` | **新規** | 前後記事ナビゲーション |
| `app/articles/[id]/page.tsx` | 修正 | サイドバー拡張、新コンポーネント統合 |
| `lib/api.ts` | 修正 | `getArticleNeighbors()` 追加 |
| `lib/types.ts` | 修正 | `ArticleNeighborItem`, `ArticleNeighborsResponse` 追加 |

### テスト (api/tests/)

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `articles.test.ts` | 修正 | neighbors エンドポイントのテスト追加 |

---

## 7. テスト計画

### 7.1 API テスト（Vitest）

| テストケース | 期待動作 |
|------------|---------|
| neighbors — 前後あり | prev と next の両方が返る |
| neighbors — 最新記事 | next が `null`、prev が存在 |
| neighbors — 最古の記事 | prev が `null`、next が存在 |
| neighbors — 存在しないID | 404 |
| neighbors — published_at が null | `{ prev: null, next: null }` |
| neighbors — 記事が1件のみ | `{ prev: null, next: null }` |
| neighbors — 同一 published_at | tiebreaker (`created_at`) で安定した結果を返す |

### 7.2 E2E テスト（Playwright）

| テストケース | 期待動作 |
|------------|---------|
| 一覧ページ — 4カラム表示 | xl ブレークポイント (1280px) で4列のグリッド |
| 記事詳細 — スティッキータイトル | viewport 1280x720, スクロールで `data-testid="sticky-title"` が `isVisible()` |
| 記事詳細 — 右サイドバー | TOC + 関連記事が表示 |
| 記事詳細 — 関連記事なし | カテゴリなし記事で関連記事セクションが非表示 |
| 記事詳細 — 前後ナビ | prev/next カードが表示、クリックで遷移 |
| レスポンシブ — モバイル | サイドバー非表示、前後ナビ縦積み、関連記事が本文下に表示 |

**Note**: StickyArticleTitle の E2E テストは IntersectionObserver ベースのため flaky になりうる。`data-testid` 属性でテスト対象を明示し、Playwright の `isVisible()` で検証する。

### 7.3 目視 QA チェックリスト

幅変更 (`max-w-5xl` → `max-w-7xl`) は全ページに影響するため、以下のページを目視確認する:

- [ ] `/articles` — 4カラムグリッドの見栄え
- [ ] `/articles/:id` — サイドバー、スティッキータイトル、前後ナビ
- [ ] `/digest` — ダイジェスト一覧の横幅バランス
- [ ] `/digest/:date` — ダイジェスト詳細
- [ ] `/sources` — ソース一覧グリッド
- [ ] モバイル (375px) — 全ページのレイアウト崩れがないこと

---

## 8. 実装順序

1. **Phase A: API** — `getArticleNeighbors` + ルート + テスト
2. **Phase B: グローバル幅** — layout, Header, Footer の `max-w-7xl` 変更
3. **Phase C: 4カラムグリッド** — ArticleGrid, HeroSection, LoadingIndicator
4. **Phase D: スティッキータイトル** — StickyArticleTitle コンポーネント
5. **Phase E: サイドバー拡張** — TOC修正 + RelatedArticles + ページ統合
6. **Phase F: 前後ナビ** — ArticleNavigation コンポーネント + ページ統合
7. **Phase G: E2E テスト**

Phase B〜C は独立して並行実装可能。Phase D〜F は Phase B の完了後。

---

## Appendix: Spec Panel レビュー対応表

v1.1 で反映した Spec Panel (Fowler, Wiegers, Adzic, Nygard, Crispin) の指摘と対応:

| # | 重要度 | 指摘 | 対応 |
|---|--------|------|------|
| 1 | Critical | `published_at` 重複時の tiebreaker 未定義 | SQL に `created_at` tiebreaker 追加 (§2.2, §3.1) |
| 2 | Critical | 3 API コールの並列化未指定 | `Promise.all` による並列取得を明記 (§4.4) |
| 3 | Major | 画像なし記事の sticky trigger が h1 だと即時発火 | `article-meta` (カテゴリ) を trigger に変更 (§4.3) |
| 4 | Major | "3〜5件" の曖昧さ | "最大5件" に明確化 (§4.4) |
| 5 | Major | 複数カテゴリ時の挙動不明 | `categories[0]` を主カテゴリとする設計判断を明記 (§4.4) |
| 6 | Major | モバイル RelatedArticles 配置位置 | モバイルレイアウト順序図を追加 (§5.2) |
| 7 | Major | Header 高さ `top-[57px]` のハードコード | 根拠を記載、`top-14` 優先に変更 (§4.3) |
| 8 | Minor | テスト: 同一 timestamp ケース不足 | テスト計画に追加 (§7.1) |
| 9 | Minor | 画像プレースホルダーの統一 | `bg-bg-secondary` 単色ブロックに統一 (§4.4, §4.5) |
| 10 | Minor | HeroSection col-span の xl 時の見栄え | 2/4 = 50% で許容範囲と判断を明記 (§4.2) |
| 11 | Minor | related/neighbors のキャッシュ | 将来課題として認識。初回は `no-store` で実装 |
| 12 | Minor | 非記事ページの目視 QA | チェックリストを追加 (§7.3) |
