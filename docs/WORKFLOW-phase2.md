# Phase 2 実装ワークフロー

> **Version**: 1.0
> **Date**: 2026-02-12
> **Base**: `docs/DESIGN-v3.0.md` v3.3
> **Status**: 実装完了

---

## 前提条件

- Phase 1.2 が完了し、`main` ブランチが最新であること
- 設計書 `docs/DESIGN-v3.0.md` v3.3 がレビュー承認済みであること
- DB マイグレーション不要（`sources` テーブル・`articles.categories` カラムは Phase 1.0 で作成済み）

---

## ブランチ戦略

```
main
 └── feature/phase2-public-features
      ├── Step 1-4:  API 機能（ソース管理、カテゴリフィルタ、RSS 配信、main.py 統合）
      ├── Step 5-6:  インフラ（Node.js 22.x、PostgreSQL SSL/TLS）
      ├── Step 7-9:  フロントエンド（SSE 統一、CSP、UI 拡張）
      ├── Step 10:   Playwright E2E テスト
      └── Step 11:   OWASP ZAP 設定
```

単一の feature ブランチで段階的にコミット。各ステップ完了後にテスト実行・確認を行う。

---

## Step 1: ソース管理 API

> 依存: なし | 見積テスト数: 19 | 設計書: §3

### 1.1 スキーマ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| SourceCreate, SourceUpdate, SourceResponse, SourceListResponse を定義 | `api/app/schemas/source.py` | **新規** |

**チェックポイント**:
- `SourceUpdate` に `model_validator(mode="after")` で `rss_url`/`name` の null 送信拒否が含まれること
- `SourceCreate.rss_url`, `site_url` が `HttpUrl` 型であること
- `extra="forbid"` が `AppBaseModel` 経由で継承されること

### 1.2 サービス層作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `create_source`, `get_sources`, `get_source_by_id`, `update_source`, `deactivate_source` を実装 | `api/app/services/source_service.py` | **新規** |

**チェックポイント**:
- `HttpUrl` → `str` 変換が `create_source`, `update_source` で行われること
- `update_source` が `exclude_unset=True` で差分のみ適用すること
- `deactivate_source` が `is_active=False` のみ設定すること

### 1.3 ルーター作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| GET/POST/PUT/DELETE `/sources` エンドポイントを実装 | `api/app/routers/sources.py` | **新規** |

**チェックポイント**:
- POST/PUT/DELETE に `Security(verify_api_key)` が付与されていること
- GET に API Key 認証がないこと
- Rate limit: GET 60/minute、POST/PUT/DELETE 10/minute
- DELETE が物理削除ではなく `deactivate_source` を呼ぶこと

### 1.4 サービス層テスト

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 7 テストケースを実装 | `api/tests/test_source_service.py` | **新規** | 7 |

テストケース: §3.7 参照

### 1.5 統合テスト

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 12 テストケースを実装 | `api/tests/test_sources.py` | **新規** | 12 |

テストケース: §3.6 参照

### 1.6 テスト実行・確認

```bash
cd api && python -m pytest tests/test_source_service.py tests/test_sources.py -v
```

**合格基準**: 19 テスト全て PASSED

---

## Step 2: カテゴリフィルタ

> 依存: なし | 見積テスト数: 5 | 設計書: §4

### 2.1 サービス層変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `get_articles` に `category_filter` パラメータ追加 | `api/app/services/article_service.py` | **変更** |

**チェックポイント**:
- `Article.categories.any(category_filter)` で PostgreSQL ARRAY の ANY 検索を使用
- 既存の `date_filter` との複合条件が正しく動作すること

### 2.2 ルーター変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `list_articles` に `category: Optional[str] = Query(None, max_length=50)` 追加 | `api/app/routers/articles.py` | **変更** |

### 2.3 サービス層テスト追加

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 2 テストケースを追加 | `api/tests/test_article_service.py` | **変更** | 2 |

テストケース: `test_get_articles_category_filter`, `test_get_articles_category_and_date`

### 2.4 統合テスト追加

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 3 テストケースを追加 | `api/tests/test_articles.py` | **変更** | 3 |

テストケース: `test_list_articles_category_filter`, `test_list_articles_category_no_match`, `test_list_articles_category_and_date`

### 2.5 テスト実行・確認

```bash
cd api && python -m pytest tests/test_article_service.py tests/test_articles.py -v
```

**合格基準**: 既存テスト + 新規 5 テスト全て PASSED

---

## Step 3: RSS 配信

> 依存: なし | 見積テスト数: 8 | 設計書: §5

### 3.1 依存パッケージ追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `feedgen==1.0.0` を追加 | `api/requirements.txt` | **変更** |

### 3.2 Settings 変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `public_url: str = "http://localhost:3100"` を追加 | `api/app/config.py` | **変更** |
| `PUBLIC_URL=https://news.example.com` を追加 | `.env.example` | **変更** |

### 3.3 サービス層作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `generate_rss_feed` を実装 | `api/app/services/rss_service.py` | **新規** |

**チェックポイント**:
- `fg.rss_str(pretty=True).decode("utf-8")` で RSS 2.0 XML を生成
- `summary_ja` のみ配信（`body_original`, `body_translated` は含まない）
- 記事なしでも有効な XML を返すこと

### 3.4 ルーター作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| GET `/feed/rss` エンドポイントを実装 | `api/app/routers/feed.py` | **新規** |

**チェックポイント**:
- Content-Type: `application/rss+xml; charset=utf-8`
- Rate limit: 30/minute
- API Key 認証なし

### 3.5 セキュリティヘッダー変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `_SKIP_CSP_PATHS` に `/feed/rss` を追加 | `api/app/middleware.py` | **変更** |

### 3.6 サービス層テスト

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 3 テストケースを実装 | `api/tests/test_rss_service.py` | **新規** | 3 |

テストケース: §5.9 参照

### 3.7 統合テスト

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 5 テストケースを実装 | `api/tests/test_feed.py` | **新規** | 5 |

テストケース: §5.8 参照

### 3.8 テスト実行・確認

```bash
cd api && python -m pytest tests/test_rss_service.py tests/test_feed.py -v
```

**合格基準**: 8 テスト全て PASSED

---

## Step 4: main.py 統合

> 依存: Step 1-3 | 設計書: §3.5, §5.6, §2.3, §11.3

### 4.1 ルーター登録

| タスク | ファイル | 操作 |
|--------|---------|------|
| `sources`, `feed` ルーターを登録 | `api/app/main.py` | **変更** |

**登録順序**: health → ingest → sse → articles → digest → sources → feed

### 4.2 CORS 拡張

| タスク | ファイル | 操作 |
|--------|---------|------|
| `allow_methods` に `"PUT"`, `"DELETE"` を追加 | `api/app/main.py` | **変更** |

### 4.3 バージョン更新

| タスク | ファイル | 操作 |
|--------|---------|------|
| `version` を `"2.0.0"` に更新 | `api/app/main.py` | **変更** |
| `version` を `"2.0.0"` に更新 | `api/pyproject.toml` | **変更** |

### 4.4 全 API テスト実行

```bash
cd api && python -m pytest tests/ -v
```

**合格基準**: Phase 1.2 既存テスト (54) + Phase 2 新規 API テスト (32) = 全て PASSED

---

## Step 5: Docker イメージ更新（Node.js 22.x）

> 依存: なし | 設計書: §2.2

### 5.1 Dockerfile 更新

| タスク | ファイル | 操作 |
|--------|---------|------|
| 全ステージの `FROM node:20.20.0-slim` を `FROM node:22.14.0-slim` に変更 | `frontend/Dockerfile` | **変更** |

### 5.2 CI ワークフロー更新

| タスク | ファイル | 操作 |
|--------|---------|------|
| `node-version: "20"` を `node-version: "22"` に変更 | `.github/workflows/ci.yml` | **変更** |

### 5.3 動作確認

```bash
make dev  # 開発環境でフロントエンドが正常に起動することを確認
```

---

## Step 6: PostgreSQL SSL/TLS

> 依存: Step 5 | 設計書: §8

### 6.1 証明書生成スクリプト作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| 自己署名証明書生成スクリプトを作成 | `db/ssl/generate-certs.sh` | **新規** |

**チェックポイント**:
- `chown 999:999` で全証明書ファイルの所有者を postgres ユーザーに設定
- `server.key` は `0600`、`server.crt`/`ca.crt` は `0644`
- ホスト上で `sudo` 権限が必要な旨のコメント

### 6.2 .gitignore 追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `db/ssl/` を追加 | `.gitignore` | **変更** |

### 6.3 Docker Compose 変更（本番）

| タスク | ファイル | 操作 |
|--------|---------|------|
| PostgreSQL SSL コマンド引数、証明書ボリュームマウント、API 接続 URL に `?ssl=require` 追加 | `docker-compose.yml` | **変更** |

### 6.4 Docker Compose 変更（開発）

| タスク | ファイル | 操作 |
|--------|---------|------|
| SSL 無効化オーバーライド（`command: []`）、SSL なし DB URL | `docker-compose.dev.yml` | **変更** |

### 6.5 動作確認

```bash
# 証明書生成
cd db/ssl && sudo bash generate-certs.sh

# 本番構成で起動確認
make up
docker compose logs news-db | grep -i ssl  # SSL 有効確認
make down
```

---

## Step 7: SSE 接続 URL 統一

> 依存: なし | 設計書: §6.5

### 7.1 ArticleListLive 変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| SSE 接続先を `'/api/articles/stream'` に変更、`NEXT_PUBLIC_SSE_URL` 使用を削除 | `frontend/src/components/ArticleListLive.tsx` | **変更** |

### 7.2 docker-compose.dev.yml 変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `NEXT_PUBLIC_SSE_URL` 環境変数を削除 | `docker-compose.dev.yml` | **変更** |

### 7.3 動作確認

```bash
make dev
# ブラウザで SSE 接続が /api/articles/stream 経由で確立されることを確認
# DevTools > Network > EventSource
```

---

## Step 8: フロントエンド CSP

> 依存: Step 7 | 設計書: §7

### 8.1 next.config.ts 変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| CSP ヘッダー設定を `headers()` で追加 | `frontend/next.config.ts` | **変更** |

**チェックポイント**:
- CSP without nonce（`unsafe-inline` 使用）
- `upgrade-insecure-requests` は `isDev` 条件で本番のみ
- `connect-src` に開発時のみ `ws:` 追加（HMR 用）
- `/api/feed/:path*` は CSP 除外（セキュリティヘッダーのみ）
- セキュリティヘッダー（X-Frame-Options, X-Content-Type-Options 等）を全ページに付与

### 8.2 動作確認

```bash
make dev
# ブラウザ DevTools > Console で CSP 違反エラーがないことを確認
# ブラウザ DevTools > Network > Response Headers で CSP ヘッダーを確認
# /api/feed/rss のレスポンスに CSP ヘッダーがないことを確認
```

---

## Step 9: フロントエンド拡張

> 依存: Step 1-3, Step 7 | 設計書: §6

### 9.1 TypeScript 型追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `SourceResponse`, `SourceListResponse` を追加 | `frontend/src/lib/types.ts` | **変更** |

### 9.2 API クライアント変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `getSources`, `getCategories` を追加。`getArticles` に `category` パラメータ追加 | `frontend/src/lib/api.ts` | **変更** |

### 9.3 CategoryFilter コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| カテゴリフィルタ Client Component を作成 | `frontend/src/components/CategoryFilter.tsx` | **新規** |

### 9.4 記事一覧ページ変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `searchParams` (Promise) で `category` を取得、`CategoryFilter` と `ArticleListLive` を統合 | `frontend/src/app/articles/page.tsx` | **変更** |

**チェックポイント**:
- `searchParams: Promise<{ category?: string }>` で型定義（Next.js 15+ の仕様）
- `<ArticleListLive key={category \|\| 'all'} />` でカテゴリ変更時にリマウント

### 9.5 ArticleListLive 変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `category` prop 追加、無限スクロールのカテゴリ対応、SSE 新着のクライアント側フィルタ | `frontend/src/components/ArticleListLive.tsx` | **変更** |

**チェックポイント**:
- `categoryRef` で stale closure 回避
- `loadMore` の URL に `category` パラメータ追加
- SSE イベントで `categories.includes(categoryRef.current)` フィルタ

### 9.6 ソース一覧ページ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| Server Component でソース一覧を表示 | `frontend/src/app/sources/page.tsx` | **新規** |

### 9.7 ヘッダーナビゲーション変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| 「ソース」リンクを追加 | `frontend/src/components/Header.tsx` | **変更** |

### 9.8 RSS リンク追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `alternates.types` に RSS リンク追加 | `frontend/src/app/layout.tsx` | **変更** |

### 9.9 動作確認

```bash
make dev
# /articles — カテゴリフィルタの動作確認
# /articles?category=ai — フィルタ適用後の記事表示
# /sources — ソース一覧ページ表示
# /api/feed/rss — RSS フィード XML 表示
# ヘッダーに「ソース」リンクが表示されること
```

---

## Step 10: Playwright E2E テスト

> 依存: Step 9 | 見積テスト数: 14 | 設計書: §10

### 10.1 セットアップ

| タスク | ファイル | 操作 |
|--------|---------|------|
| `@playwright/test` を devDependencies に追加、テストスクリプト追加 | `frontend/package.json` | **変更** |
| Playwright 設定を作成 | `frontend/playwright.config.ts` | **新規** |

**チェックポイント**:
- `baseURL` と `webServer.url` が同一の `BASE_URL`（`http://localhost:3000`）を使用
- `webServer.env.API_URL` が `http://localhost:8100`

### 10.2 テストデータ準備

| タスク | ファイル | 操作 |
|--------|---------|------|
| API 経由でテストデータを投入する globalSetup を作成 | `frontend/e2e/global-setup.ts` | **新規** |

### 10.3 テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| ホームページテスト | `frontend/e2e/home.spec.ts` | **新規** | 2 |
| 記事一覧・詳細テスト | `frontend/e2e/articles.spec.ts` | **新規** | 5 |
| ダイジェストテスト | `frontend/e2e/digest.spec.ts` | **新規** | 2 |
| ソース一覧テスト | `frontend/e2e/sources.spec.ts` | **新規** | 1 |
| ナビゲーションテスト | `frontend/e2e/navigation.spec.ts` | **新規** | 2 |
| アクセシビリティテスト | `frontend/e2e/accessibility.spec.ts` | **新規** | 2 |

### 10.4 CI 統合

| タスク | ファイル | 操作 |
|--------|---------|------|
| `frontend-e2e` ジョブを追加 | `.github/workflows/ci.yml` | **変更** |

### 10.5 Makefile ターゲット追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `test-e2e`, `test-e2e-ui` ターゲットを追加 | `Makefile` | **変更** |

### 10.6 .gitignore 追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `playwright-report/` を追加 | `.gitignore` | **変更** |

### 10.7 テスト実行・確認

```bash
# API サーバーを起動した状態で
make test-e2e
```

**合格基準**: 14 テスト全て PASSED（Chromium, Firefox, WebKit）

---

## Step 11: OWASP ZAP 設定

> 依存: Step 4 | 設計書: §9

### 11.1 ZAP 設定ファイル作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| ZAP スキャン設定を作成 | `zap-config.conf` | **新規** |

### 11.2 Makefile ターゲット追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `zap-scan` ターゲットを追加 | `Makefile` | **変更** |

**チェックポイント**:
- `ZAP_API_KEY`（`API_KEYS` とは別の単一キー）を使用
- `-z` オプションで `X-API-Key` ヘッダーを自動付与

### 11.3 .gitignore 追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `zap-reports/` を追加 | `.gitignore` | **変更** |

### 11.4 動作確認

```bash
# API サーバーを起動した状態で
make zap-scan
# zap-reports/report.html が生成されることを確認
```

---

## 最終確認

### 全テスト実行

```bash
# API テスト（既存 + Phase 2 新規）
cd api && python -m pytest tests/ -v

# E2E テスト
make test-e2e

# セキュリティチェック
make security
```

### 合格基準

| テスト種別 | テスト数 |
|-----------|---------|
| API 統合テスト | 58 (Phase 1.2: 38 + Phase 2: 20) |
| サービス単体テスト | 28 (Phase 1.2: 16 + Phase 2: 12) |
| フロントエンド E2E | 14 |
| **合計** | **100** |

### PR 作成

全テスト合格後に `feature/phase2-public-features` → `main` の PR を作成する。

---

## ファイル変更サマリ

### 新規ファイル (13)

| ファイル | Step |
|---------|------|
| `api/app/schemas/source.py` | 1 |
| `api/app/services/source_service.py` | 1 |
| `api/app/routers/sources.py` | 1 |
| `api/tests/test_source_service.py` | 1 |
| `api/tests/test_sources.py` | 1 |
| `api/app/services/rss_service.py` | 3 |
| `api/app/routers/feed.py` | 3 |
| `api/tests/test_rss_service.py` | 3 |
| `api/tests/test_feed.py` | 3 |
| `db/ssl/generate-certs.sh` | 6 |
| `frontend/src/components/CategoryFilter.tsx` | 9 |
| `frontend/src/app/sources/page.tsx` | 9 |
| `frontend/playwright.config.ts` | 10 |

### 変更ファイル (18)

| ファイル | Step |
|---------|------|
| `api/requirements.txt` | 3 |
| `api/app/config.py` | 3 |
| `api/app/main.py` | 4 |
| `api/app/middleware.py` | 3 |
| `api/app/routers/articles.py` | 2 |
| `api/app/services/article_service.py` | 2 |
| `api/tests/test_articles.py` | 2 |
| `api/tests/test_article_service.py` | 2 |
| `api/pyproject.toml` | 4 |
| `docker-compose.yml` | 6 |
| `docker-compose.dev.yml` | 6, 7 |
| `frontend/Dockerfile` | 5 |
| `frontend/package.json` | 10 |
| `frontend/next.config.ts` | 8 |
| `frontend/src/components/ArticleListLive.tsx` | 7, 9 |
| `frontend/src/lib/api.ts` | 9 |
| `frontend/src/lib/types.ts` | 9 |
| `frontend/src/components/Header.tsx` | 9 |

### その他変更

| ファイル | Step |
|---------|------|
| `frontend/src/app/layout.tsx` | 9 |
| `frontend/src/app/articles/page.tsx` | 9 |
| `frontend/e2e/global-setup.ts` | 10 |
| `frontend/e2e/*.spec.ts` (6 files) | 10 |
| `.github/workflows/ci.yml` | 5, 10 |
| `.env.example` | 3 |
| `.gitignore` | 6, 10, 11 |
| `Makefile` | 10, 11 |
| `zap-config.conf` | 11 |
