# Tech News Aggregator - 要件仕様書

> **Version**: 1.0
> **Date**: 2025-02-06
> **Architecture**: v4.1 Final
> **Scope**: Docker側実装（n8n/Ollama設定は別途）

---

## 1. プロジェクト概要

### 1.1 目的

海外テックニュースを自動収集・翻訳・要約し、日本語で配信するシステム。

### 1.2 設計原則

- **n8nがすべてのフローと処理を制御**: RSS取得、重複判定、Ollama直接呼び出しによる翻訳・要約、保存指示まで
- **n8nがOllamaを直接叩く**: 翻訳・要約はn8nのHTTP RequestノードからOllama APIへ直接リクエスト
- **Docker APIは本文抽出・保存・配信のみ**: LLM処理を一切持たない。Ollama依存なし
- **ソース追加・プロンプト調整はn8n GUIのみで完結**: コード変更不要

### 1.3 アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                         n8n (既存)                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │Schedule │→│RSS Read │→│重複Check│→│ Ingest  │            │
│  │Trigger  │  │         │  │(API)    │  │ (API)   │            │
│  └─────────┘  └─────────┘  └─────────┘  └────┬────┘            │
│                                              ↓                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │  Save   │←│  要約   │←│  翻訳   │←│ Ollama  │            │
│  │ (API)   │  │(Ollama) │  │(Ollama) │  │ :11434  │            │
│  └────┬────┘  └─────────┘  └─────────┘  └─────────┘            │
└───────┼─────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────┐
│                    Docker Compose (本実装スコープ)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  news-api    │  │ news-frontend│  │   news-db    │        │
│  │  (FastAPI)   │  │  (Next.js)   │  │ (PostgreSQL) │        │
│  │   :8100      │  │    :3100     │  │    :5432     │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. 機能要件

### 2.1 記事本文抽出 (POST /ingest)

| 項目 | 仕様 |
|------|------|
| 入力 | `{"url": "https://..."}` |
| 処理 | trafilaturaで本文＋メタデータ抽出 |
| 出力 | タイトル、本文、著者、公開日、OG画像URL |
| 失敗時 | エラーレスポンス（n8n側でRSS descriptionをfallback利用可能） |
| 備考 | **保存はしない**（n8nが翻訳・要約後にPOST /articlesで保存指示） |

### 2.2 重複チェック (GET /articles/check)

| 項目 | 仕様 |
|------|------|
| 入力 | `?url=https://...` |
| 出力 | `{"exists": true/false}` |
| 用途 | n8nが記事処理前に既存チェック |

### 2.3 記事保存 (POST /articles)

| 項目 | 仕様 |
|------|------|
| 入力 | 原文、翻訳文、要約、メタデータを一括 |
| 処理 | PostgreSQLに保存 |
| 呼び出し元 | n8nのみ |

### 2.4 記事配信 (GET /articles, GET /articles/{id})

| エンドポイント | 仕様 |
|----------------|------|
| GET /articles | 記事一覧（要約のみ）、ページネーション、日付フィルタ対応 |
| GET /articles/{id} | 記事詳細（要約 + 元記事リンク + メタデータ） |

### 2.5 ダイジェスト (POST /digest, GET /digest, GET /digest/{date})

| エンドポイント | 仕様 |
|----------------|------|
| POST /digest | n8nが生成したダイジェストを保存 |
| GET /digest | ダイジェスト一覧 |
| GET /digest/{date} | 日付指定でダイジェスト取得（YYYY-MM-DD形式） |

### 2.6 ヘルスチェック (GET /health)

| 項目 | 仕様 |
|------|------|
| 出力 | `{"status": "healthy", "db": "connected"}` |
| 用途 | Docker / n8nからの死活監視 |

---

## 3. API エンドポイント一覧

| Method | Path | Caller | Description |
|--------|------|--------|-------------|
| GET | `/health` | Any | ヘルスチェック |
| GET | `/articles/check?url=` | n8n | 重複チェック |
| POST | `/ingest` | n8n | 本文抽出（保存しない） |
| POST | `/articles` | n8n | 記事保存 |
| GET | `/articles` | Frontend | 記事一覧（ページネーション対応） |
| GET | `/articles/{id}` | Frontend | 記事詳細 |
| POST | `/digest` | n8n | ダイジェスト保存 |
| GET | `/digest` | Frontend | ダイジェスト一覧 |
| GET | `/digest/{date}` | Frontend | 日付指定ダイジェスト |

---

## 4. データベーススキーマ

### 4.1 articles テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 主キー |
| source_url | TEXT | UNIQUE, IDX | 元記事URL（重複チェック用） |
| source_name | VARCHAR(100) | | ソース名（TechCrunch等） |
| title_original | TEXT | | 原文タイトル |
| title_ja | TEXT | | 日本語タイトル |
| body_original | TEXT | | 原文本文 |
| body_translated | TEXT | | 翻訳本文 |
| summary_ja | TEXT | | 日本語要約（公開用） |
| author | VARCHAR(200) | | 著者名 |
| published_at | TIMESTAMPTZ | IDX | 元記事の公開日時 |
| og_image_url | TEXT | | OGP画像URL |
| categories | TEXT[] | | カテゴリ配列 |
| metadata | JSONB | | その他メタデータ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

### 4.2 digests テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 主キー |
| digest_date | DATE | UNIQUE, IDX | ダイジェスト対象日 |
| title | TEXT | | ダイジェストタイトル |
| content | TEXT | | ダイジェスト本文 |
| article_count | INTEGER | | 対象記事数 |
| article_ids | UUID[] | | 対象記事IDリスト |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

### 4.3 sources テーブル（管理用）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 主キー |
| name | VARCHAR(100) | | ソース名 |
| rss_url | TEXT | UNIQUE | RSSフィードURL |
| site_url | TEXT | | サイトURL |
| category | VARCHAR(50) | | カテゴリ |
| is_active | BOOLEAN | DEFAULT TRUE | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

---

## 5. 非機能要件

### 5.1 技術スタック

| レイヤー | 技術 | バージョン |
|----------|------|-----------|
| Language | Python | 3.12 |
| Framework | FastAPI | latest |
| ORM | SQLAlchemy | 2.0 (async) |
| Migration | Alembic | latest |
| DB | PostgreSQL | 16 |
| Frontend | Next.js | 14+ (SSG) |
| Container | Docker Compose | v2 |
| 本文抽出 | trafilatura | latest |

### 5.2 ポート割り当て

| サービス | ポート |
|----------|--------|
| news-api | 8100 |
| news-frontend | 3100 |
| news-db | 5432 |

### 5.3 テスト

| 種別 | ツール | 対象 |
|------|--------|------|
| APIテスト | pytest + httpx | 全エンドポイント |
| DB | TestContainers or SQLite | テスト用DB |

---

## 6. Docker Registry

### 6.1 レジストリ情報

| 項目 | 値 |
|------|-----|
| URL | https://registry.oshiire.to |
| 運用方式 | ビルド後にpush → 本番はregistryからpull |

### 6.2 イメージ命名規則

| サービス | イメージ名 |
|----------|-----------|
| API | `registry.oshiire.to/news-curator/api:{tag}` |
| Frontend | `registry.oshiire.to/news-curator/frontend:{tag}` |

### 6.3 タグ運用

| タグ | 用途 |
|------|------|
| `latest` | 最新安定版 |
| `v1.0.0` | リリースバージョン |
| `dev` | 開発版 |

### 6.4 運用フロー

```bash
# 開発: ローカルビルド
docker compose build

# Push: レジストリへアップロード
docker push registry.oshiire.to/news-curator/api:latest
docker push registry.oshiire.to/news-curator/frontend:latest

# 本番: レジストリからデプロイ
docker compose pull
docker compose up -d
```

---

## 7. Docker Compose 構成

### 7.1 サービス一覧

| サービス | 状態 | 説明 |
|----------|------|------|
| news-api | NEW | FastAPI。本文抽出・保存・配信 |
| news-frontend | NEW | Next.js SSG。公開サイト |
| news-db | NEW | PostgreSQL 16 |
| n8n | EXISTING | ワークフロー管理（別管理） |
| ollama | EXISTING | LLM（Mac Studio上で稼働） |

### 7.2 ボリューム

| ボリューム | マウント先 | 用途 |
|------------|-----------|------|
| postgres_data | /var/lib/postgresql/data | DBデータ永続化 |

---

## 8. スケジュール（n8n側で設定）

| 頻度 | ワークフロー | 処理内容 |
|------|-------------|----------|
| 2時間おき | Workflow A | RSS巡回→重複チェック→本文取得→翻訳→要約→保存 |
| 毎日 23:00 JST | Workflow B | 当日記事取得→ダイジェスト生成→保存 |

---

## 9. 著作権対応

| 公開範囲 | 提供内容 |
|----------|----------|
| 公開API | 要約 + 元記事リンクのみ |
| プライベート | 全文翻訳（Phase 2以降で認証付き実装） |

---

## 10. フェーズ計画

### Phase 1 — MVP（本実装スコープ）

- [x] FastAPI + PostgreSQL でSlim API実装
- [x] Docker Compose構成（3コンテナ）
- [x] Alembicマイグレーション
- [x] APIエンドポイントテスト
- [x] 最小限のNext.js SSGフロントエンド
- [ ] n8n Workflow A/B（別途実装）

### Phase 2 — 公開（将来）

- フロントエンドUI整備
- デイリーダイジェスト運用
- ソースを10〜15に拡大
- カテゴリ・タグ分類
- 自サイトのRSS配信

### Phase 3 — 収益化（将来）

- 認証機能（JWT）
- 全文翻訳エンドポイント
- Stripe連携
- 独自分析・コメント追加
- Newsletter配信
- ユーザー管理

---

## 11. Phase 1 スコープ外

以下は本フェーズでは実装しない:

- 認証・認可機能
- `/articles/{id}/full`（全文翻訳エンドポイント）
- ユーザー管理
- Newsletter配信
- Stripe連携
- n8nワークフロー構築
- Ollama設定

---

## 12. 初期RSSソース（参考）

Phase 1 検証用として大手テック系を想定:

- TechCrunch
- The Verge
- Ars Technica

※ 実際のRSS URLはn8n側で設定

---

## Appendix A: ディレクトリ構成（予定）

```
tech-news-curator/
├── api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   └── services/
│   ├── alembic/
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── docker-compose.dev.yml
├── Makefile
├── docs/
│   └── REQUIREMENTS.md
└── README.md
```

---

## Appendix B: 環境変数

### API (news-api)

| 変数 | 説明 | 例 |
|------|------|-----|
| DATABASE_URL | PostgreSQL接続文字列 | postgresql+asyncpg://user:pass@news-db:5432/news |
| ENVIRONMENT | 環境識別子 | development / production |

### Frontend (news-frontend)

| 変数 | 説明 | 例 |
|------|------|-----|
| NEXT_PUBLIC_API_URL | APIエンドポイント | http://news-api:8100 |

### Database (news-db)

| 変数 | 説明 | 例 |
|------|------|-----|
| POSTGRES_USER | DBユーザー | news |
| POSTGRES_PASSWORD | DBパスワード | ******* |
| POSTGRES_DB | DB名 | news_curator |
