# Tech News Curator

海外テックニュースを収集・翻訳・要約し、日本語のデイリーダイジェストとして配信するシステムです。

> **[English README](README.md)**

## 概要

Tech News Curator は、テックニュースパイプラインのためのストレージ・抽出・配信レイヤーを提供する3サービス構成の Docker アプリケーションです。外部の **n8n** インスタンスが RSS 取得、重複排除、コンテンツ抽出、翻訳（Ollama経由）、要約、デイリーダイジェスト生成のワークフロー全体をオーケストレーションします。

```
n8n（オーケストレーター）
 ├── RSS取得 → POST /articles/check（重複チェック）
 ├── POST /ingest（trafilaturaでコンテンツ抽出）
 ├── Ollama（翻訳 + 要約）
 ├── POST /articles（記事保存）
 └── POST /digest（デイリーダイジェスト生成）

Docker Compose
 ├── news-db       （PostgreSQL 16）     :5432
 ├── news-api      （FastAPI）           :8100
 └── news-frontend （Next.js 16）        :3100
```

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| API | Python 3.12、FastAPI 0.128、Pydantic 2.12、SQLAlchemy 2.0（非同期） |
| データベース | PostgreSQL 16、Alembic 1.18、asyncpg |
| コンテンツ抽出 | trafilatura 2.0 |
| フロントエンド | Next.js 16.1、React 19.2、TypeScript 5、Tailwind CSS 4 |
| テスト | pytest 9、testcontainers（PostgreSQL）、httpx 0.28 |

## 必要要件

- Docker & Docker Compose v2
- Python 3.12 以上（テストをローカル実行する場合）
- Node.js 20 以上（Docker 外でフロントエンド開発する場合）

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
make test         # APIテスト実行（要: pip install -r api/requirements-dev.txt）
make migrate msg="add column"   # Alembic マイグレーション生成
make migrate-up                 # 実行中コンテナでマイグレーション適用
make push         # registry.oshiire.to へイメージをプッシュ
```

### 単一テストの実行

```bash
cd api && python -m pytest tests/test_articles.py::test_create_article -v
```

## APIエンドポイント

| メソッド | パス | 用途 | 利用元 |
|---------|------|------|--------|
| `GET` | `/health` | ヘルスチェック（DB接続確認） | 監視 |
| `POST` | `/ingest` | URLから記事抽出（trafilatura） | n8n |
| `GET` | `/articles/check?url=` | 重複チェック | n8n |
| `POST` | `/articles` | 記事作成 | n8n |
| `GET` | `/articles?page=&per_page=&date=` | 記事一覧（ページネーション） | フロントエンド |
| `GET` | `/articles/{id}` | 記事詳細 | フロントエンド |
| `POST` | `/digest` | デイリーダイジェスト作成 | n8n |
| `GET` | `/digest` | ダイジェスト一覧 | フロントエンド |
| `GET` | `/digest/{date}` | 日付指定ダイジェスト（YYYY-MM-DD） | フロントエンド |

### リクエスト/レスポンス例

**コンテンツ抽出:**
```bash
curl -X POST http://localhost:8100/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
# → {"title": "...", "body": "...", "author": "...", "published_at": "2026-01-01", "og_image_url": "..."}
```

**記事作成:**
```bash
curl -X POST http://localhost:8100/articles \
  -H "Content-Type: application/json" \
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
├── app/
│   ├── main.py          # FastAPI アプリ（lifespan管理）
│   ├── config.py        # 設定（DATABASE_URL, ENVIRONMENT）
│   ├── database.py      # AsyncEngine、セッションファクトリ、Base
│   ├── models/          # SQLAlchemy ORM（Article, Digest, Source）
│   ├── schemas/         # Pydantic v2 リクエスト/レスポンスモデル
│   ├── services/        # ビジネスロジック（article, digest, ingest）
│   └── routers/         # HTTPエンドポイント
├── alembic/             # データベースマイグレーション
└── tests/               # 統合テスト（testcontainers）

frontend/src/
├── app/                 # Next.js ページ（Server Components）
├── components/          # UIコンポーネント（Header, Footer, Cards）
└── lib/                 # APIクライアント、TypeScript型定義
```

## 環境変数

| 変数 | サービス | 説明 |
|------|---------|------|
| `POSTGRES_PASSWORD` | .env（ホスト） | データベースパスワード（全サービス共通） |
| `DATABASE_URL` | news-api | PostgreSQL接続文字列（asyncpgドライバ） |
| `ENVIRONMENT` | news-api | `development` または `production` |
| `API_URL` | news-frontend | 内部API URL（例: `http://news-api:8100`） |

## ライセンス

MIT License - sho kisaragi
