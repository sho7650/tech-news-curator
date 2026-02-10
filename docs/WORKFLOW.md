# Tech News Curator - 実装ワークフロー

> **Version**: 1.0
> **Date**: 2026-02-06
> **Based on**: DESIGN.md v1.1
> **Purpose**: 実装計画のみ。コード生成は行わない。

---

## 概要

設計書§15の実装順序に基づき、14ステップを5つのフェーズに分割する。
各タスクには依存関係、入力/出力、検証基準を明記する。

```
Phase A: API基盤         [Step 1-4]   ── 依存なし
Phase B: APIロジック     [Step 5-7]   ── Phase A完了後
Phase C: APIテスト       [Step 8]     ── Phase B完了後
Phase D: フロントエンド  [Step 9-12]  ── Phase A完了後（Phase Bと並行可能）
Phase E: 統合            [Step 13-14] ── Phase C, D完了後
```

---

## Phase A: API基盤（Step 1-4）

### Step 1: プロジェクト骨格

**目的:** api/ ディレクトリ構造と依存管理ファイルの作成

**作成ファイル:**
```
api/
├── app/
│   ├── __init__.py
│   ├── models/
│   │   └── __init__.py
│   ├── schemas/
│   │   └── __init__.py
│   ├── routers/
│   │   └── __init__.py
│   └── services/
│       └── __init__.py
├── tests/
│   └── __init__.py
├── requirements.txt
├── requirements-dev.txt
└── pyproject.toml
```

**タスク:**
1. `api/` 以下のディレクトリ構造を作成（全 `__init__.py` 含む）
2. `requirements.txt` を作成（本番依存のみ、設計書§12.1準拠）
3. `requirements-dev.txt` を作成（`-r requirements.txt` 継承、設計書§12.2準拠）
4. `pyproject.toml` を作成（pytest設定含む、設計書§11.4準拠）

**検証:**
- `pip install -r api/requirements-dev.txt` が成功すること
- ディレクトリ構造が設計書§3.1と一致すること

**依存:** なし

---

### Step 2: 設定・DB接続

**目的:** アプリケーション設定とデータベース接続の基盤

**作成ファイル:**
```
api/app/
├── config.py
└── database.py
```

**タスク:**
1. `config.py` を作成（設計書§3.2準拠）
   - `pydantic_settings.BaseSettings` + `SettingsConfigDict`
   - `database_url`, `environment` フィールド
2. `database.py` を作成（設計書§3.3準拠）
   - `create_async_engine` + `async_sessionmaker`
   - `expire_on_commit=False`, `pool_pre_ping=True`
   - `Base(AsyncAttrs, DeclarativeBase)`
   - `get_session()` 依存関数（yield + commit/rollback）

**検証:**
- `from app.config import Settings` がインポートできること
- `from app.database import Base, get_session` がインポートできること

**依存:** Step 1

---

### Step 3: ORMモデル

**目的:** 3テーブルのSQLAlchemy 2.0モデル定義

**作成ファイル:**
```
api/app/models/
├── __init__.py   (再エクスポート)
├── article.py
├── digest.py
└── source.py
```

**タスク:**
1. `article.py` を作成（設計書§4.1準拠）
   - `Mapped[]` + `mapped_column()` パターン
   - `DateTime(timezone=True)` for `published_at`, `created_at`
   - `ARRAY(Text)` for `categories`
   - `JSONB` for `metadata`（属性名は `metadata_`、カラム名は `metadata`）
   - `published_at` のみインデックス（`source_url` は `unique=True` で自動）
2. `digest.py` を作成（設計書§4.2準拠）
   - `ARRAY(UUID)` for `article_ids`
   - `DateTime(timezone=True)` for `created_at`
3. `source.py` を作成（設計書§4.3準拠）
   - `DateTime(timezone=True)` for `created_at`
4. `__init__.py` を更新（設計書§4.4準拠）
   - `Article`, `Digest`, `Source` の再エクスポート

**検証:**
- `from app.models import Article, Digest, Source` がインポートできること
- `Base.metadata.tables` に3テーブルが登録されていること

**依存:** Step 2

**注意事項:**
- `UUID(as_uuid=True)` を使用
- `server_default=func.now()` を `created_at` に設定
- `source_url` に重複インデックスを作らない

---

### Step 4: Alembic初期設定

**目的:** 非同期対応Alembic環境と初期マイグレーション

**作成ファイル:**
```
api/
├── alembic/
│   ├── versions/
│   ├── env.py
│   └── script.py.mako
└── alembic.ini
```

**タスク:**
1. `alembic init -t async alembic` を実行
2. `alembic.ini` を編集
   - `sqlalchemy.url` を設定（env.pyでオーバーライドされるためプレースホルダー可）
3. `env.py` を編集（設計書§8.2準拠）
   - `app.config.Settings` から `DATABASE_URL` を取得
   - `app.models` から全モデルをインポート
   - `Base.metadata` を `target_metadata` に設定
   - `NullPool` を使用
4. 初期マイグレーションの生成方法を確認（実行はDB接続時）

**検証:**
- `alembic/env.py` が `async_engine_from_config` を使用していること
- `from app.models import Article, Digest, Source` が env.py 内で実行されること

**依存:** Step 3

**注意事項:**
- マイグレーション生成（`alembic revision --autogenerate`）にはPostgreSQL接続が必要
- この時点ではファイル構造と `env.py` の設定まで。実際のマイグレーション生成はDocker環境構築後

---

## Phase B: APIロジック（Step 5-7）

### Step 5: Pydanticスキーマ

**目的:** リクエスト/レスポンスのバリデーションモデル

**作成ファイル:**
```
api/app/schemas/
├── __init__.py   (AppBaseModel定義)
├── article.py
├── digest.py
├── ingest.py
└── health.py
```

**タスク:**
1. `__init__.py` に `AppBaseModel` を定義（設計書§5.1準拠）
   - `ConfigDict(from_attributes=True, str_strip_whitespace=True)`
2. `article.py` を作成（設計書§5.2準拠）
   - `ArticleCreate`: n8nからの入力。`published_at` は `Optional[datetime]`（docstringに型フロー記載）
   - `ArticleListItem`: 一覧用（要約のみ）
   - `ArticleDetail`: 詳細用（`body_original`, `body_translated` は著作権対応で除外）
   - `ArticleListResponse`: ページネーション付きレスポンス
   - `ArticleCheckResponse`: 重複チェック結果
3. `digest.py` を作成（設計書§5.3準拠）
   - `DigestCreate`, `DigestResponse`, `DigestListItem`, `DigestListResponse`
4. `ingest.py` を作成（設計書§5.4準拠）
   - `IngestRequest`, `IngestResponse`（`published_at` は `Optional[str]`）
5. `health.py` を作成（設計書§5.5準拠）
   - `HealthResponse`

**検証:**
- 全スキーマクラスがインポートできること
- `ArticleCreate(source_url="https://example.com")` がバリデーション通過すること

**依存:** Step 1（モデルへの依存なし。Pydanticスキーマは独立）

---

### Step 6: サービス層

**目的:** ビジネスロジック関数の実装

**作成ファイル:**
```
api/app/services/
├── __init__.py
├── ingest_service.py
├── article_service.py
└── digest_service.py
```

**タスク:**
1. `ingest_service.py` を作成（設計書§7.1準拠）
   - `extract_article(url) -> IngestResponse | None`
   - `trafilatura.fetch_url()` + `bare_extraction()`（v2.0 Document API）
   - 同期関数（ブロッキングIO）
2. `article_service.py` を作成（設計書§7.2準拠）
   - `check_article_exists(session, url) -> bool`
   - `create_article(session, data) -> Article`（`flush()` のみ、`commit()` なし）
   - `get_articles(session, page, per_page, date_filter) -> tuple[list, int]`
     - 日付フィルタ: 半開区間 `[start, start+1day)`
   - `get_article_by_id(session, article_id) -> Article | None`
3. `digest_service.py` を作成（設計書§7.3準拠）
   - `create_digest(session, data) -> Digest`
   - `get_digests(session) -> tuple[list, int]`
   - `get_digest_by_date(session, digest_date) -> Digest | None`

**検証:**
- 全サービス関数がインポートできること
- 型シグネチャが設計書と一致すること

**依存:** Step 3（モデル）, Step 5（スキーマ）

**注意事項:**
- `create_article` で `data.model_dump()` を使用。Pydantic v2ではこれが `.dict()` の後継
- `ingest_service.extract_article` はブロッキング関数。ルーターで `def` エンドポイントとして呼び出す

---

### Step 7: ルーター（API）

**目的:** 全9エンドポイントの実装と main.py への登録

**作成ファイル:**
```
api/app/
├── main.py
└── routers/
    ├── __init__.py
    ├── health.py
    ├── ingest.py
    ├── articles.py
    └── digest.py
```

**タスク:**
1. `routers/health.py` を作成（設計書§6.2 GET /health）
   - `SELECT 1` で DB 接続確認
   - 200（healthy）/ 503（unhealthy）
2. `routers/ingest.py` を作成（設計書§6.2 POST /ingest）
   - `def` エンドポイント（trafilaturaがブロッキングIOのため）
   - 422 on failure
3. `routers/articles.py` を作成（設計書§6.2）
   - `GET /articles/check?url=` — 重複チェック
   - `POST /articles` — 記事作成（201 / 409）
   - `GET /articles` — ページネーション + 日付フィルタ
   - `GET /articles/{id}` — 詳細取得（200 / 404）
   - `IntegrityError` 捕捉で 409 Conflict
4. `routers/digest.py` を作成（設計書§6.2）
   - `POST /digest` — ダイジェスト作成（201 / 409）
   - `GET /digest` — 一覧取得
   - `GET /digest/{date}` — 日付指定取得（200 / 404）
5. `main.py` を作成（設計書§3.4準拠）
   - `lifespan` コンテキストマネージャ（shutdown で `engine.dispose()`）
   - 4ルーターを `include_router` で登録

**検証:**
- `uvicorn app.main:app` が起動すること（DB接続なしでもインポートエラーなし）
- OpenAPI docs (`/docs`) にエンドポイントが表示されること

**依存:** Step 6（サービス層）

**注意事項:**
- `POST /ingest` は `def`（同期）エンドポイント。FastAPIがスレッドプールで自動実行
- 他のエンドポイントは `async def`
- `Depends(get_session)` でセッションを注入

---

## Phase C: APIテスト（Step 8）

### Step 8: テスト

**目的:** 全エンドポイントの自動テスト

**作成ファイル:**
```
api/tests/
├── __init__.py
├── conftest.py
├── test_health.py
├── test_ingest.py
├── test_articles.py
└── test_digest.py
```

**タスク:**
1. `conftest.py` を作成（設計書§11.2準拠）
   - `postgres_container` フィクスチャ（session スコープ）
     - `PostgresContainer("postgres:16", driver=None)`
   - `db_engine` フィクスチャ（function スコープ）
     - `get_connection_url(driver="asyncpg")` でURL取得
     - `NullPool` 使用
     - テストごとに `create_all` / `drop_all`
   - `db_session` フィクスチャ
   - `client` フィクスチャ（`app.dependency_overrides`）
2. `test_health.py` を作成（設計書§11.3準拠）
   - `test_health_ok`
3. `test_ingest.py` を作成
   - `test_ingest_success`（trafilatura をモック）
   - `test_ingest_fetch_failure`
   - `test_ingest_extract_failure`
4. `test_articles.py` を作成
   - `test_create_article`
   - `test_create_article_duplicate`（409）
   - `test_check_article_exists` / `test_check_article_not_exists`
   - `test_list_articles`（ページネーション確認）
   - `test_list_articles_date_filter`
   - `test_get_article_detail` / `test_get_article_not_found`（404）
5. `test_digest.py` を作成
   - `test_create_digest`
   - `test_create_digest_duplicate_date`（409）
   - `test_list_digests`
   - `test_get_digest_by_date` / `test_get_digest_not_found`（404）

**検証:**
- `cd api && python -m pytest tests/ -v` が全テストパスすること
- Docker が起動していること（testcontainers 要件）

**依存:** Step 7（ルーター完成後）

**注意事項:**
- testcontainers の `driver=None` でコンテナ起動、`get_connection_url(driver="asyncpg")` でURL取得（greenletエラー回避）
- `test_ingest_*` は `trafilatura.fetch_url` と `trafilatura.bare_extraction` をモック
- `pytest-asyncio` の `asyncio_mode = "auto"` で `@pytest.mark.asyncio` 不要

---

## Phase D: フロントエンド（Step 9-12）

> Phase A 完了後に Phase B と並行して開始可能。
> ただし API クライアント（lib/api.ts）の動作確認は Phase B 完了後。

### Step 9: Docker（API）

**目的:** API と DB の Docker 化

**作成ファイル:**
```
api/Dockerfile
docker-compose.yml
docker-compose.dev.yml
.env.example
```

**タスク:**
1. `api/Dockerfile` を作成（設計書§10.3準拠）
   - `python:3.12-slim`
   - `requirements.txt` のみインストール（テスト依存は含まない）
   - CMD: `uvicorn`（マイグレーションは含まない）
2. `docker-compose.yml` を作成（設計書§10.1準拠）
   - `news-db`: postgres:16 + healthcheck
   - `news-api`: ビルド + image名 + `depends_on` (service_healthy)
   - `news-frontend`: プレースホルダー（Step 12で完成）
   - `volumes: postgres_data`
3. `docker-compose.dev.yml` を作成（設計書§10.2準拠）
   - `--reload` 付き uvicorn
   - ボリュームマウント
4. `.env.example` を作成（設計書§14.1準拠）

**検証:**
- `docker compose up news-db news-api` で API が起動すること
- `curl http://localhost:8100/health` が `{"status":"healthy","db":"connected"}` を返すこと

**依存:** Step 7（API実装完了）

**注意事項:**
- この時点で初めて Alembic マイグレーション生成が可能になる
- `docker compose exec news-api alembic revision --autogenerate -m "create initial tables"`
- `docker compose exec news-api alembic upgrade head`

---

### Step 10: フロントエンド骨格

**目的:** Next.js プロジェクトの初期化

**作成ファイル:**
```
frontend/
├── src/
│   ├── app/
│   │   └── layout.tsx
│   ├── components/
│   └── lib/
│       ├── api.ts
│       └── types.ts
├── public/
├── next.config.ts
├── package.json
├── tsconfig.json
└── eslint.config.mjs
```

**タスク:**
1. `npx create-next-app@latest frontend` で初期化（TypeScript, App Router, Tailwind CSS）
2. `next.config.ts` を編集（設計書§9.2準拠）
   - `output: 'standalone'`
   - `images.remotePatterns` 設定
3. `lib/types.ts` を作成
   - API レスポンス型定義（`ArticleListResponse`, `ArticleDetail`, etc.）
4. `lib/api.ts` を作成（設計書§9.3準拠）
   - `API_URL` 環境変数（`NEXT_PUBLIC_` なし）
   - 全 fetch に `cache: 'no-store'`

**検証:**
- `cd frontend && npm run dev` が起動すること
- `lib/api.ts` の型チェックが通ること

**依存:** なし（API と独立して開始可能）

---

### Step 11: フロントエンド実装

**目的:** ページコンポーネントと共通UIの実装

**作成ファイル:**
```
frontend/src/
├── app/
│   ├── layout.tsx        (ルートレイアウト)
│   ├── page.tsx          (トップページ)
│   ├── not-found.tsx     (404)
│   ├── articles/
│   │   ├── page.tsx      (記事一覧)
│   │   └── [id]/
│   │       └── page.tsx  (記事詳細)
│   └── digest/
│       ├── page.tsx      (ダイジェスト一覧)
│       └── [date]/
│           └── page.tsx  (日付指定ダイジェスト)
└── components/
    ├── Header.tsx
    ├── Footer.tsx
    ├── ArticleCard.tsx
    └── DigestCard.tsx
```

**タスク:**
1. `layout.tsx` — ヘッダー/フッター含むルートレイアウト
2. `page.tsx` — トップページ（最新記事一覧表示）
3. `not-found.tsx` — 404ページ
4. `articles/page.tsx` — 記事一覧（設計書§9.4 Server Component パターン）
5. `articles/[id]/page.tsx` — 記事詳細（`params` は `Promise` 型、`notFound()` 使用）
6. `digest/page.tsx` — ダイジェスト一覧
7. `digest/[date]/page.tsx` — 日付指定ダイジェスト（`notFound()` 使用）
8. 共通コンポーネント: `Header`, `Footer`, `ArticleCard`, `DigestCard`

**検証:**
- 全ページがブラウザで表示できること（API 起動状態で）
- 存在しないIDで404ページが表示されること

**依存:** Step 10（骨格）, Step 9（API Docker起動で動作確認）

**注意事項:**
- `params` は Next.js 16 で `Promise` 型。`await params` が必要
- `generateStaticParams()` は使用しない（ランタイムfetch方式）
- `API_URL` はサーバー側環境変数のみ

---

### Step 12: Docker（フロントエンド）

**目的:** フロントエンドの Docker 化と docker-compose への統合

**作成ファイル:**
```
frontend/Dockerfile
```

**タスク:**
1. `frontend/Dockerfile` を作成（設計書§10.4準拠）
   - builder ステージ: `npm ci` + `npm run build`
   - production ステージ: standalone 出力 + `node server.js`
   - dev ステージ: `npm run dev`
2. `docker-compose.yml` の `news-frontend` を完成
   - `environment: API_URL: http://news-api:8100`
   - `ports: "3100:3000"`
   - `depends_on: news-api`
3. `docker-compose.dev.yml` の `news-frontend` を完成
   - `target: dev`
   - ボリュームマウント

**検証:**
- `docker compose build news-frontend` が成功すること
- `docker compose up` で3サービス全起動すること
- `http://localhost:3100` でフロントエンドが表示されること

**依存:** Step 11（フロントエンド実装完了）

---

## Phase E: 統合（Step 13-14）

### Step 13: Makefile

**目的:** 開発・運用コマンドの一元化

**作成ファイル:**
```
Makefile
```

**タスク:**
1. `Makefile` を作成（設計書§13準拠）
   - `dev`: 開発環境起動
   - `up`: 本番起動
   - `down`: 停止
   - `build`: ビルド
   - `test`: テスト実行（`requirements-dev.txt` 前提）
   - `migrate`: マイグレーション作成
   - `migrate-up`: マイグレーション適用
   - `deploy`: DB→API→マイグレーション→フロントエンドの順序実行
   - `push`: レジストリへ push

**検証:**
- `make test` が全テストパスすること
- `make dev` で開発環境が起動すること

**依存:** Step 9, Step 12（Docker環境完成後）

---

### Step 14: 統合確認

**目的:** 全体の動作確認と Alembic マイグレーション生成

**タスク:**
1. Alembicマイグレーション生成・適用
   ```
   make deploy
   ```
   - news-db 起動
   - news-api 起動
   - `alembic upgrade head`（初期テーブル作成）
   - news-frontend 起動

2. 全エンドポイント手動確認
   - `GET http://localhost:8100/health` → 200
   - `POST http://localhost:8100/ingest` → 本文抽出
   - `GET http://localhost:8100/articles/check?url=...` → exists: false
   - `POST http://localhost:8100/articles` → 201
   - `GET http://localhost:8100/articles` → 記事一覧
   - `GET http://localhost:8100/articles/{id}` → 記事詳細
   - `POST http://localhost:8100/digest` → 201
   - `GET http://localhost:8100/digest` → ダイジェスト一覧
   - `GET http://localhost:8100/digest/{date}` → ダイジェスト

3. フロントエンド表示確認
   - `http://localhost:3100` → トップページ
   - `http://localhost:3100/articles` → 記事一覧
   - `http://localhost:3100/articles/{id}` → 記事詳細
   - `http://localhost:3100/digest` → ダイジェスト一覧

4. 全テスト実行
   ```
   make test
   ```

**検証:**
- 全エンドポイントが期待通りのレスポンスを返すこと
- フロントエンドが API データを表示できること
- 全テストがパスすること

**依存:** Step 13（Makefile完成後）

---

## 依存関係図

```
Step 1: プロジェクト骨格
  │
  ├── Step 2: 設定・DB接続
  │     │
  │     └── Step 3: ORMモデル
  │           │
  │           ├── Step 4: Alembic初期設定
  │           │
  │           └── Step 5: Pydanticスキーマ ←─── (Step 1からも直接可能)
  │                 │
  │                 └── Step 6: サービス層
  │                       │
  │                       └── Step 7: ルーター
  │                             │
  │                             ├── Step 8: テスト
  │                             │
  │                             └── Step 9: Docker（API）
  │                                   │
  │                                   └── Step 11: フロントエンド実装
  │                                         │
  │                                         └── Step 12: Docker（フロントエンド）
  │
  └── Step 10: フロントエンド骨格 ←─── (Step 1と並行可能)
        │
        └── Step 11: フロントエンド実装
              │
              └── Step 12: Docker（フロントエンド）
                    │
                    └── Step 13: Makefile
                          │
                          └── Step 14: 統合確認
```

## 並行実行可能なタスク

| 並行グループ | タスク | 条件 |
|-------------|--------|------|
| Group 1 | Step 5（スキーマ）+ Step 10（FE骨格） | Step 1 完了後 |
| Group 2 | Step 8（テスト）+ Step 11（FE実装） | それぞれの依存完了後 |

---

## チェックポイント

| # | タイミング | 確認内容 | 合格基準 |
|---|-----------|---------|---------|
| CP1 | Step 4完了後 | API基盤が整っているか | モデルのインポート成功、Alembic env.py 設定完了 |
| CP2 | Step 7完了後 | API単体が動作するか | `uvicorn` 起動、`/docs` にエンドポイント表示 |
| CP3 | Step 8完了後 | 全APIテストパス | `pytest` 全テストグリーン |
| CP4 | Step 9完了後 | Docker環境でAPI動作 | `docker compose up` で `/health` 応答 |
| CP5 | Step 12完了後 | 全コンテナ動作 | 3サービス起動、フロントエンド表示 |
| CP6 | Step 14完了後 | 統合テスト完了 | 全エンドポイント手動確認 + `make test` パス |

---

## リスクと対策

| リスク | 影響 | 対策 |
|-------|------|------|
| testcontainers の greenlet エラー | テスト実行不可 | `driver=None` で起動、`get_connection_url(driver="asyncpg")` で取得 |
| trafilatura v2.0 の API 変更 | ingest 機能の破損 | `bare_extraction()` が `Document` オブジェクトを返す前提でコード実装 |
| Next.js 16 の `params` Promise 化 | 型エラー | `await params` パターンを全動的ルートで使用 |
| httpx 0.28+ の `app=` 削除 | テストクライアント作成失敗 | `ASGITransport(app=app)` を使用 |
| pytest-asyncio 1.0+ の `event_loop` 削除 | フィクスチャエラー | `asyncio_mode = "auto"` + `loop_scope` 対応 |
