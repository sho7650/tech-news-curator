# Tech News Curator

海外テックニュースを収集・翻訳・要約し、日本語のデイリーダイジェストとして配信するシステムです。

> **[English README](README.md)**

## 概要

Tech News Curator は、テックニュースパイプラインのためのストレージ・抽出・配信レイヤーを提供する3サービス構成の Docker アプリケーションです。外部の **n8n** インスタンスが RSS 取得、重複排除、コンテンツ抽出、翻訳（Ollama経由）、要約、デイリーダイジェスト生成のワークフロー全体をオーケストレーションします。

```
n8n（オーケストレーター）
 ├── RSS取得 → POST /articles/check（重複チェック）
 ├── POST /ingest（@mozilla/readabilityでコンテンツ抽出）
 ├── Ollama（翻訳 + 要約）
 ├── POST /articles（記事保存）
 └── POST /digest（デイリーダイジェスト生成）

Docker Compose
 ├── news-db       （PostgreSQL 16）     :5432
 ├── news-api      （Hono + Node.js）    :8100
 └── news-frontend （Next.js 16）        :3100
```

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| API | Node.js 22、Hono 4.x、Drizzle ORM、Zod |
| データベース | PostgreSQL 16、drizzle-kit（マイグレーション） |
| コンテンツ抽出 | @mozilla/readability + linkedom |
| フロントエンド | Next.js 16.3、React 19.2、TypeScript 5、Tailwind CSS 4 |
| テスト | Vitest、@testcontainers/postgresql |

## 必要要件

- Docker & Docker Compose v2
- Node.js 22 以上（Docker 外で開発する場合）— または [Nix 開発シェル](#nix-開発シェル任意)を使えばバージョンを自動で固定できます

## Nix 開発シェル（任意）

[Nix flake](flake.nix) が再現性のあるツールチェーン（Node 22 + `make`・`psql`・
`git`・`jq`）を提供します。`nvm` は不要です。[direnv](https://direnv.net/) 利用時:

```bash
direnv allow           # リポジトリに cd するだけでツールチェーンが自動有効化
```

手動の場合は `nix develop`。DB とテストは引き続き Docker が必要です。
詳細は [docs/NIX-DEVELOPMENT.md](docs/NIX-DEVELOPMENT.md) を参照してください。

## クイックスタート

```bash
# 1. 環境設定
cp .env.example .env
# .env を編集して POSTGRES_PASSWORD を設定

# 2. 開発環境を起動（ホットリロード付き）
make dev

# サービス:
#   API:          http://localhost:8100
#   フロントエンド: http://localhost:3100
#   DB:           localhost:5432
```

## コマンド

```bash
make dev          # ホットリロード付き開発モード（API + フロントエンド）
make up           # 本番サービス起動（バックグラウンド）
make down         # 全サービス停止
make build        # Docker イメージビルド
make deploy       # 本番デプロイ: DB → API → マイグレーション → フロントエンド
make test         # APIテスト実行（Node.js + Docker 必須）
make test-e2e     # E2E テスト実行（Playwright、Docker 必須）
make migrate      # 新しい Drizzle マイグレーション生成
make migrate-up   # 実行中コンテナでマイグレーション適用
make push         # コンテナレジストリへイメージをプッシュ
```

### 単一テストの実行

```bash
cd api && npm test                            # 全テスト実行
cd api && npx vitest run tests/articles.test.ts   # 特定テストファイル実行
make test-e2e                                 # E2E テスト実行（.env から API キーを使用）
```

## APIエンドポイント

| メソッド | パス | 用途 | 利用元 |
|---------|------|------|--------|
| `GET` | `/health` | ヘルスチェック（DB接続確認） | 監視 |
| `POST` | `/ingest` | URLから記事抽出（@mozilla/readability） | n8n |
| `GET` | `/articles/check?url=` | 重複チェック | n8n |
| `POST` | `/articles` | 記事作成 | n8n |
| `GET` | `/articles?page=&per_page=&date=&category=` | 記事一覧（ページネーション、要約のみ） | フロントエンド |
| `GET` | `/articles/{id}` | 記事詳細（全保存フィールド） | フロントエンド |
| `GET` | `/articles/{id}/neighbors` | 前後の記事 | フロントエンド |
| `GET` | `/articles/stream` | 新着記事の Server-Sent Events | フロントエンド |
| `POST` | `/digest` | デイリーダイジェスト作成 | n8n |
| `GET` | `/digest` | ダイジェスト一覧 | フロントエンド |
| `GET` | `/digest/{date}` | 日付指定ダイジェスト（YYYY-MM-DD） | フロントエンド |
| `GET` | `/digest/source-articles?date=` | 指定 JST 日の記事本文一括取得（ダイジェスト生成用） | n8n |
| `GET` | `/sources?page=&per_page=&active_only=` | ソース一覧 | フロントエンド、n8n |
| `POST` | `/sources` | ソース作成 | n8n |
| `PUT` | `/sources/{id}` | ソース更新 | n8n |
| `DELETE` | `/sources/{id}` | ソース無効化 | n8n |
| `GET` | `/feed/rss` | 最新記事の RSS フィード | リーダー |

### リクエスト/レスポンス例

書き込み系エンドポイント（`POST`、`PUT`、`DELETE`）には `API_KEYS` のいずれかと一致する `X-API-Key` ヘッダーが必要です。

**コンテンツ抽出:**
```bash
curl -X POST http://localhost:8100/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <key1>" \
  -d '{"url": "https://example.com/article"}'
# → {"title": "...", "body": "...", "author": "...", "published_at": "2026-01-01", "og_image_url": "..."}
```

**記事作成:**
```bash
curl -X POST http://localhost:8100/articles \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <key1>" \
  -d '{
    "source_url": "https://example.com/article",
    "title_original": "Title",
    "title_ja": "タイトル",
    "summary_ja": "要約テキスト",
    "published_at": "2026-01-01T00:00:00Z"
  }'
# → 201 Created
```

**重複チェック:**
```bash
curl "http://localhost:8100/articles/check?url=https://example.com/article"
# → {"exists": true}
```

## プロジェクト構成

```
api/
├── src/
│   ├── index.ts         # Hono アプリ エントリーポイント
│   ├── config.ts        # 設定（DATABASE_URL, ENVIRONMENT, CORS_ORIGINS, API_KEYS）
│   ├── database.ts      # Drizzle ORM クライアント、postgres.js プール
│   ├── routes/          # HTTP エンドポイント（Hono ルート）
│   ├── services/        # ビジネスロジック（article, digest, ingest, SSE）
│   ├── schemas/         # Zod 検証スキーマ
│   ├── middleware/      # 認証、レート制限、セキュリティヘッダー、エラーハンドラ
│   └── db/
│       ├── schema/      # Drizzle ORM テーブル定義
│       └── migrations/  # SQL マイグレーション（drizzle-kit 生成）
├── tests/               # 統合テスト（Vitest + testcontainers）
└── package.json         # スクリプト: dev, build, test, lint

frontend/src/
├── app/                 # Next.js ページ（Server Components）
├── components/          # UIコンポーネント（Header, Footer, Cards）
└── lib/                 # APIクライアント、TypeScript型定義
```

## 環境変数

| 変数 | サービス | 説明 |
|------|---------|------|
| `POSTGRES_PASSWORD` | .env（ホスト） | データベースパスワード（全サービス共通） |
| `DATABASE_URL` | news-api | PostgreSQL接続文字列（例: `postgresql://user:pass@host:5432/db`） |
| `DATABASE_ADMIN_URL` | news-api | PostgreSQL 管理者URL（オプション、マイグレーション用） |
| `ENVIRONMENT` | news-api | `development`、`production`、`test`、`staging` |
| `CORS_ORIGINS` | news-api | カンマ区切りの CORS 許可オリジンリスト |
| `API_KEYS` | news-api | カンマ区切りの n8n 用 API キーリスト |
| `PUBLIC_URL` | news-api | フロントエンドの公開 URL（デフォルト: `http://localhost:3100`） |
| `FETCH_USER_AGENT` | news-api | 外部 HTTP リクエストの User-Agent |
| `TRUSTED_PROXIES` | news-api | リバースプロキシの信頼する CIDR リスト（カンマ区切り、オプション；空の場合はヘッダーを無視） |
| `API_URL` | news-frontend | 内部API URL（例: `http://news-api:8100`） |

## コンテンツ利用について

このシステムは **個人的又は家庭内利用のみ** を想定しています。本システムが取得・保存・翻訳する記事コンテンツは、日本著作権法 第 30 条（私的使用のための複製）および第 47-6 条（翻訳等による利用）の対象となります。原著者の許諾を得ずに **公開インターネットにデプロイしないでください**。

記事詳細エンドポイント（`GET /articles/{id}`）は保存されているすべてのフィールド（`body_original` と `body_translated` を含む）を返します。一覧エンドポイントと RSS フィードはペイロードサイズ最適化のため要約のみを返します。

## ライセンス

MIT License - sho kisaragi
