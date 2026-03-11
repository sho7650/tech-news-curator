# WORKFLOW: ニュースレイアウト改善

**Design Doc**: `docs/DESIGN-layout-improvement.md` v1.1
**Date**: 2026-03-11
**Branch**: `feat/layout-improvement`

---

## 依存関係マップ

```
Phase A: API (neighbors)
    │
    ├──→ Phase B: グローバル幅 ──→ Phase D: スティッキータイトル
    │                                  │
    ├──→ Phase C: 4カラムグリッド       ├──→ Phase E: サイドバー拡張
    │     (B と並行可)                  │
    │                                   ├──→ Phase F: 前後ナビ
    │                                   │
    └───────────────────────────────────┴──→ Phase G: ページ統合
                                                │
                                                └──→ Phase H: テスト + QA
```

**並行可能なペア**: Phase B + C（独立したファイル群）

---

## Phase A: API — neighbors エンドポイント

**目的**: 前後記事ナビゲーション用の API を実装・テスト

### A-1: スキーマ型定義
- [ ] `api/src/schemas/article.ts` — `ArticleNeighborItem`, `ArticleNeighborsResponse` インターフェース追加
- **検証**: `npx tsc --noEmit`

### A-2: サービス関数
- [ ] `api/src/services/article-service.ts` — `getArticleNeighbors()` 追加
  - 対象記事の `published_at` + `created_at` を取得
  - `published_at` が null → `{ prev: null, next: null }`
  - prev/next を `Promise.all` で並列クエリ
  - tiebreaker: `ORDER BY published_at DESC, created_at DESC`
- **検証**: `npx tsc --noEmit`

### A-3: ルート追加
- [ ] `api/src/routes/articles.ts` — `GET /articles/:article_id/neighbors`
  - `createRateLimiter(200)` + `uuidParamSchema`
  - `getArticleNeighbors` → null なら 404
  - レスポンスフォーマッタ関数
- **検証**: `npx tsc --noEmit`

### A-4: API テスト
- [ ] `api/tests/articles.test.ts` — neighbors テストケース追加
  - 前後あり
  - 最新記事（next=null）
  - 最古の記事（prev=null）
  - 存在しない ID → 404
  - published_at が null → `{ prev: null, next: null }`
  - 記事1件のみ → `{ prev: null, next: null }`
  - **同一 published_at → tiebreaker で安定した結果**
- **検証**: `cd api && npm test`

### A: チェックポイント
- [ ] 全テスト通過 (既存 + 新規 neighbors 7ケース)
- [ ] `npx biome check src/` — lint 通過
- [ ] `npx tsc --noEmit` — 型チェック通過

---

## Phase B: グローバル幅 — max-w-5xl → max-w-7xl

**目的**: 全ページのコンテナ幅を拡張

### B-1: レイアウト変更
- [ ] `frontend/src/app/layout.tsx` — `max-w-5xl` → `max-w-7xl`
- [ ] `frontend/src/components/Header.tsx` — `max-w-5xl` → `max-w-7xl`
- [ ] `frontend/src/components/Footer.tsx` — `max-w-5xl` → `max-w-7xl`

### B: チェックポイント
- [ ] `cd frontend && npx next build` が成功
- [ ] 3ファイルのみ変更されていること (`git diff --stat`)

---

## Phase C: 4カラムグリッド

**目的**: 記事一覧を xl ブレークポイントで4列に

### C-1: グリッドコンポーネント
- [ ] `frontend/src/components/ArticleGrid.tsx` — `xl:grid-cols-4` 追加
- [ ] `frontend/src/components/HeroSection.tsx` — `xl:grid-cols-4` 追加（`lg:col-span-2` は維持）
- [ ] `frontend/src/components/ArticleListLive.tsx` — LoadingIndicator
  - グリッドに `xl:grid-cols-4` 追加
  - スケルトン数を `[...Array(3)]` → `[...Array(4)]`

### C: チェックポイント
- [ ] `cd frontend && npx next build` が成功
- [ ] 3ファイルのみ変更

---

## Phase D: スティッキータイトルバー

**目的**: スクロール時に記事タイトルをヘッダー下に表示

### D-1: 新規コンポーネント作成
- [ ] `frontend/src/components/StickyArticleTitle.tsx` — 新規作成
  - `'use client'` コンポーネント
  - Props: `{ title, imageUrl, triggerId }`
  - `IntersectionObserver` で `triggerId` 要素を監視
  - `transition-opacity duration-300` でフェードイン/アウト
  - `pointer-events-none` when hidden
  - `data-testid="sticky-title"` 付与
  - `sticky top-14 z-40 bg-bg-primary/80 backdrop-blur-md border-b border-border`
  - 内部: `max-w-7xl mx-auto px-4` + サムネイル (36px) + タイトル (truncate)
  - 画像なし時: サムネイル非表示、タイトルのみ

### D: チェックポイント
- [ ] `cd frontend && npx next build` が成功
- [ ] コンポーネント単体で lint 通過

---

## Phase E: サイドバー拡張 — TOC + 関連記事

**目的**: 右サイドバーを拡張し、目次の下に関連記事を表示

### E-1: TOC 修正
- [ ] `frontend/src/components/TableOfContents.tsx`
  - Desktop `<nav>` から `lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto` を除去
  - （sticky は親要素が制御。IO rootMargin は影響なし）

### E-2: 関連記事コンポーネント
- [ ] `frontend/src/components/RelatedArticles.tsx` — 新規作成
  - Server Component（props で articles を受け取る）
  - `articles.length === 0` → `null` 返却
  - 見出し「関連記事」 + 区切り線
  - 各アイテム: 48×48 サムネイル + タイトル (line-clamp-2) + メタ
  - 画像なし: `bg-bg-secondary rounded` 単色ブロック
  - `<Link>` でラップ

### E: チェックポイント
- [ ] `cd frontend && npx next build` が成功
- [ ] TOC の既存動作に影響がないこと（ビルド成功で確認）

---

## Phase F: 前後記事ナビゲーション

**目的**: 記事末尾に前後の記事への導線を追加

### F-1: フロントエンド API 関数 + 型
- [ ] `frontend/src/lib/types.ts` — `ArticleNeighborItem`, `ArticleNeighborsResponse` 追加
- [ ] `frontend/src/lib/api.ts` — `getArticleNeighbors()` 追加

### F-2: ナビゲーションコンポーネント
- [ ] `frontend/src/components/ArticleNavigation.tsx` — 新規作成
  - Server Component（props で prev/next を受け取る）
  - `prev === null && next === null` → `null` 返却
  - グリッド: `grid-cols-1 sm:grid-cols-2`
  - prev: `flex-row` (画像左)、next: `flex-row-reverse text-right` (画像右)
  - サムネイル: 64×64、画像なしは `bg-bg-secondary rounded-lg`
  - ラベル: "← 前の記事" / "次の記事 →"
  - 片方のみ: `sm:col-start-1` / `sm:col-start-2` で位置固定

### F: チェックポイント
- [ ] `cd frontend && npx next build` が成功

---

## Phase G: ページ統合 — 記事詳細ページ

**目的**: 全コンポーネントを記事詳細ページに統合

### G-1: 記事詳細ページ修正
- [ ] `frontend/src/app/articles/[id]/page.tsx` — 大幅修正
  - **データ取得**:
    ```
    article = await getArticleById(id)
    [relatedData, neighbors] = await Promise.all([...])
    ```
  - **ヒーロー画像**: `id="hero-image"` 追加
  - **メタセクション**: `id="article-meta"` 追加
  - **StickyArticleTitle 追加**: hero-image or article-meta を triggerId に
  - **サイドバー拡張**:
    - `w-56` → `w-72`
    - `<div>` → `<aside>`
    - sticky wrapper: `<div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">`
    - TOC + RelatedArticles をラップ
  - **前後ナビ**: 本文の下に `<ArticleNavigation>`
  - **モバイル関連記事**: `<div className="mt-8 lg:hidden">` で RelatedArticles を本文下にも表示

### G: チェックポイント
- [ ] `cd frontend && npx next build` が成功
- [ ] インポートが正しいこと
- [ ] データフロー: article → Promise.all → props 渡しが正しいこと

---

## Phase H: テスト + QA

**目的**: 全変更の品質検証

### H-1: API テスト再確認
- [ ] `cd api && npm test` — 全テスト通過
- [ ] `cd api && npx biome check src/` — lint
- [ ] `cd api && npx tsc --noEmit` — 型

### H-2: フロントエンド ビルド確認
- [ ] `cd frontend && npx next build` — ビルド成功

### H-3: 目視 QA (Docker Compose)
- [ ] `make dev` でローカル起動
- [ ] `/articles` — 4カラムグリッド (1280px+)
- [ ] `/articles/:id` — スティッキータイトル、サイドバー (TOC+関連)、前後ナビ
- [ ] `/articles/:id` (画像なし記事) — sticky trigger が meta セクション
- [ ] `/articles/:id` (カテゴリなし記事) — 関連記事セクション非表示
- [ ] `/digest` — 横幅バランス
- [ ] `/sources` — グリッドレイアウト
- [ ] モバイル (375px) — サイドバー非表示、前後ナビ縦積み、関連記事が本文下

### H: 完了条件
- [ ] API テスト全通過
- [ ] ビルド成功
- [ ] 目視 QA 全項目クリア

---

## コミット戦略

| Phase | ブランチ | コミットメッセージ |
|-------|---------|-------------------|
| A | `feat/layout-improvement` | `feat(api): add GET /articles/:id/neighbors endpoint` |
| B+C | 同上 | `feat(frontend): widen layout to max-w-7xl with 4-column grid` |
| D | 同上 | `feat(frontend): add sticky article title on scroll` |
| E | 同上 | `feat(frontend): add related articles to sidebar` |
| F | 同上 | `feat(frontend): add prev/next article navigation` |
| G | 同上 | `feat(frontend): integrate layout improvements into article page` |
| H | — | テスト通過確認後、PR 作成 |

**PR タイトル**: `feat: improve news layout with wider grid, sticky title, related articles, and prev/next navigation`

---

## リスク & 緩和策

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| Docker 内 API の neighbors レスポンスが遅い | 記事ページ表示遅延 | Promise.all で並列化済み。ISR 検討は将来課題 |
| TOC の IO が sticky wrapper 変更で壊れる | 目次ハイライト不動作 | IO root はデフォルト viewport、影響なし。Phase G で動作確認 |
| StickyArticleTitle の E2E テストが flaky | CI 不安定 | data-testid + isVisible() で安定化。初回は目視 QA で代替 |
| max-w-7xl で digest/sources ページが間延び | デザイン劣化 | Phase H の目視 QA で確認。問題あれば個別ページで max-w 調整 |
