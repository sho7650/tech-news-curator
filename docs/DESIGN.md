# Tech News Curator - 設計書

> **Version**: 1.1
> **Date**: 2026-02-06
> **Based on**: REQUIREMENTS.md v1.0 (Architecture v4.1 Final)
> **Scope**: Phase 1 MVP — Docker側実装（news-api, news-frontend, news-db）

---

## 1. 技術スタック（確定バージョン）

調査時点（2026年2月）の最新安定版に基づく。

### 1.1 バックエンド（news-api）

| パッケージ | バージョン | 根拠 |
|-----------|-----------|------|
| Python | 3.12 | 要件指定 |
| FastAPI | >=0.128.0,<0.130.0 | 最新安定版 0.128.2。Pydantic v1互換shim完全削除済み |
| Pydantic | >=2.12.0,<3.0.0 | FastAPI 0.128.0の要求: `>=2.7.0` |
| pydantic-settings | >=2.12.0 | FastAPI standardに同梱。`BaseSettings`の分離パッケージ |
| SQLAlchemy | >=2.0.46,<2.1.0 | 2.0系最新安定版。`[asyncio]`エクストラ必須 |
| Alembic | >=1.18.0,<1.19.0 | 最新 1.18.3。Python 3.10+要求 |
| asyncpg | >=0.31.0 | PostgreSQL asyncドライバ |
| uvicorn | >=0.40.0 | ASGI サーバー |
| trafilatura | >=2.0.0 | 本文抽出。v2.0で`bare_extraction()`がDocumentオブジェクト返却に変更 |
| httpx | >=0.28.1 | テスト用。`app=`引数が削除済み、`ASGITransport`必須 |

### 1.2 フロントエンド（news-frontend）

| パッケージ | バージョン | 根拠 |
|-----------|-----------|------|
| Next.js | 16.1.x | 最新安定版。Turbopackデフォルト化、React Compiler内蔵 |
| React | 19.2 | Next.js 16に同梱 |
| TypeScript | 5.x | Next.js 16のデフォルト |

### 1.3 インフラ

| 技術 | バージョン | 根拠 |
|------|-----------|------|
| PostgreSQL | 16 | 要件指定 |
| Docker Compose | v2 | 要件指定 |

### 1.4 テスト

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| pytest | >=9.0 | テストフレームワーク |
| pytest-asyncio | >=1.3.0 | 非同期テスト。1.0で`event_loop`フィクスチャ削除 |
| httpx | >=0.28.1 | AsyncClient + ASGITransport |
| testcontainers[postgres] | >=4.8.2 | テスト用PostgreSQLコンテナ |
| asgi-lifespan | >=2.1.0 | lifespan イベントのテスト用 |

---

## 2. システムアーキテクチャ

### 2.1 コンテナ構成

```
┌────────────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                          │
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │   news-api       │  │  news-frontend   │  │    news-db      │ │
│  │   (FastAPI)      │  │  (Next.js)       │  │  (PostgreSQL)   │ │
│  │   Port: 8100     │  │  Port: 3100      │  │  Port: 5432     │ │
│  │                  │  │                  │  │                 │ │
│  │  ┌────────────┐  │  │  Node.js server  │  │  articles       │ │
│  │  │ /ingest    │  │  │  Server Comps    │  │  digests        │ │
│  │  │ /articles  │  │  │  runtime fetch   │  │  sources        │ │
│  │  │ /digest    │  │  │  → news-api      │  │                 │ │
│  │  │ /health    │  │  │                  │  │                 │ │
│  │  └────────────┘  │  └──────────────────┘  └─────────────────┘ │
│  │        │         │           │                     ▲          │
│  │        └─────────┼───────────┼─────────────────────┘          │
│  └──────────────────┘           │                                 │
│                                 │ runtime fetch                    │
│                                 ▼ (SSR or client-side)             │
│                          news-api:8100                             │
└────────────────────────────────────────────────────────────────────┘
         ▲                        ▲
         │                        │
    n8n (外部)              ブラウザ (外部)
    - POST /ingest          - GET /articles (via frontend)
    - GET /articles/check   - GET /articles/{id} (via frontend)
    - POST /articles        - GET /digest (via frontend)
    - POST /digest          - GET /digest/{date} (via frontend)
```

### 2.2 データフロー

```
[n8n Workflow A: 2時間おき]
  1. RSS読み取り
  2. GET /articles/check?url=... → 重複チェック
  3. POST /ingest {url} → 本文抽出（trafilatura）→ レスポンス返却（保存しない）
  4. n8n → Ollama :11434 → 翻訳
  5. n8n → Ollama :11434 → 要約
  6. POST /articles {...} → DB保存

[n8n Workflow B: 毎日 23:00 JST]
  1. GET /articles?date=2026-02-06 → 当日記事取得（n8nが実日付を算出して渡す）
  2. n8n → Ollama → ダイジェスト生成
  3. POST /digest {...} → DB保存

[Frontend 表示時]
  1. ブラウザ → news-frontend:3100 → ページ表示
  2. Server Component → news-api:8100/articles → 記事一覧取得
  3. Server Component → news-api:8100/articles/{id} → 記事詳細取得
  4. Server Component → news-api:8100/digest → ダイジェスト取得

  ※ SSGではなくNode.jsサーバーでのランタイムfetchとする（§9参照）
```

---

## 3. API設計（news-api）

### 3.1 プロジェクト構造

要件書のAppendix Aに従い、レイヤー分割構造を採用する。

```
api/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPIアプリ生成、lifespan、ミドルウェア、ルーター登録
│   ├── config.py             # pydantic-settings による設定管理
│   ├── database.py           # AsyncEngine, AsyncSessionFactory, Base, get_session依存
│   ├── models/
│   │   ├── __init__.py       # 全モデルの再エクスポート（Alembic用）
│   │   ├── article.py        # Article ORMモデル
│   │   ├── digest.py         # Digest ORMモデル
│   │   └── source.py         # Source ORMモデル
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── article.py        # Article Pydanticスキーマ群
│   │   ├── digest.py         # Digest Pydanticスキーマ群
│   │   ├── ingest.py         # Ingestリクエスト/レスポンス
│   │   └── health.py         # Health レスポンス
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── articles.py       # /articles エンドポイント群
│   │   ├── digest.py         # /digest エンドポイント群
│   │   ├── ingest.py         # /ingest エンドポイント
│   │   └── health.py         # /health エンドポイント
│   └── services/
│       ├── __init__.py
│       ├── article_service.py  # 記事CRUD操作
│       ├── digest_service.py   # ダイジェストCRUD操作
│       └── ingest_service.py   # trafilatura本文抽出ロジック
├── alembic/
│   ├── versions/              # マイグレーションファイル
│   ├── env.py                 # Async対応env.py
│   └── script.py.mako
├── alembic.ini
├── tests/
│   ├── __init__.py
│   ├── conftest.py            # テストフィクスチャ（AsyncClient, DB session）
│   ├── test_health.py
│   ├── test_ingest.py
│   ├── test_articles.py
│   └── test_digest.py
├── Dockerfile
├── requirements.txt           # 本番依存のみ
├── requirements-dev.txt       # テスト・開発依存（requirements.txt を継承）
└── pyproject.toml
```

### 3.2 設定管理 (config.py)

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str = "postgresql+asyncpg://news:CHANGEME@localhost:5432/news_curator"
    environment: str = "development"
```

- `DATABASE_URL`環境変数から接続文字列を取得
- `ENVIRONMENT`で環境識別（development / production）
- `.env`ファイルからのフォールバック読み込み対応

### 3.3 データベース接続 (database.py)

```python
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import Settings

settings = Settings()

async_engine = create_async_engine(
    settings.database_url,
    echo=(settings.environment == "development"),
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
)

AsyncSessionFactory = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,  # async必須: コミット後の暗黙的遅延読み込み防止
)


class Base(AsyncAttrs, DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

**設計判断:**
- `expire_on_commit=False`: async環境では必須。コミット後の属性アクセスで暗黙的IOを防止
- `pool_pre_ping=True`: 長時間稼働時の接続ステートネス検出
- `AsyncAttrs`ミックスイン: `awaitable_attrs`による遅延読み込み属性のawait対応
- セッション依存関数: FastAPIの`Depends()`でリクエスト単位のセッション管理

### 3.4 アプリケーションエントリポイント (main.py)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import async_engine
from app.routers import articles, digest, ingest, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 必要に応じて初期化処理
    yield
    # Shutdown: エンジンのクリーンアップ
    await async_engine.dispose()


app = FastAPI(
    title="Tech News Curator API",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(articles.router)
app.include_router(digest.router)
```

**設計判断:**
- `lifespan`コンテキストマネージャ: 非推奨の`on_event`デコレータではなく、現行推奨パターン
- shutdown時に`async_engine.dispose()`で接続プールをクリーンアップ
- 各ルーターは`include_router`で登録

---

## 4. ORMモデル設計

SQLAlchemy 2.0の`Mapped[]`/`mapped_column()`パターンを使用。

### 4.1 Article モデル (models/article.py)

```python
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, Index, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_url: Mapped[str] = mapped_column(Text, unique=True)
    source_name: Mapped[Optional[str]] = mapped_column(String(100))
    title_original: Mapped[Optional[str]] = mapped_column(Text)
    title_ja: Mapped[Optional[str]] = mapped_column(Text)
    body_original: Mapped[Optional[str]] = mapped_column(Text)
    body_translated: Mapped[Optional[str]] = mapped_column(Text)
    summary_ja: Mapped[Optional[str]] = mapped_column(Text)
    author: Mapped[Optional[str]] = mapped_column(String(200))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    og_image_url: Mapped[Optional[str]] = mapped_column(Text)
    categories: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_articles_published_at", "published_at"),
    )
```

**設計判断:**
- `UUID(as_uuid=True)`: Python側でuuid.UUIDオブジェクトとして扱う
- `default=uuid.uuid4`: アプリケーション側でUUID生成（DB側`gen_random_uuid()`も可）
- `metadata_`属性名: Pythonの`metadata`予約語との衝突回避。`mapped_column("metadata", ...)`でDBカラム名は`metadata`
- `ARRAY(Text)`: PostgreSQL固有のARRAY型。categoriesに使用
- `JSONB`: PostgreSQL固有。柔軟なメタデータ格納
- `Mapped[Optional[str]]`: NULL許可カラムの型ヒント表現
- `DateTime(timezone=True)`: `published_at`と`created_at`にTIMESTAMPTZを明示。全日時はUTC timezone-awareで統一
- `server_default=func.now()`: DB側でのデフォルト値設定
- `source_url`の`unique=True`が自動的にUNIQUEインデックスを作成するため、別途`Index`は定義しない

### 4.2 Digest モデル (models/digest.py)

```python
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Digest(Base):
    __tablename__ = "digests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    digest_date: Mapped[date] = mapped_column(Date, unique=True)
    title: Mapped[Optional[str]] = mapped_column(Text)
    content: Mapped[Optional[str]] = mapped_column(Text)
    article_count: Mapped[Optional[int]] = mapped_column(Integer)
    article_ids: Mapped[Optional[list[uuid.UUID]]] = mapped_column(ARRAY(UUID(as_uuid=True)))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

### 4.3 Source モデル (models/source.py)

```python
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[Optional[str]] = mapped_column(String(100))
    rss_url: Mapped[str] = mapped_column(Text, unique=True)
    site_url: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

### 4.4 models/__init__.py

```python
from app.models.article import Article
from app.models.digest import Digest
from app.models.source import Source

__all__ = ["Article", "Digest", "Source"]
```

Alembicの`env.py`でこのモジュールをインポートすることで、全モデルが`Base.metadata`に登録される。

---

## 5. Pydanticスキーマ設計

Pydantic v2の`ConfigDict`パターンを使用。`from_attributes=True`でORMオブジェクトからの変換を有効化。

### 5.1 共通ベース

```python
from pydantic import BaseModel, ConfigDict


class AppBaseModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
    )
```

### 5.2 Article スキーマ (schemas/article.py)

```python
import uuid
from datetime import datetime
from typing import Optional

from app.schemas import AppBaseModel


# --- リクエスト ---

class ArticleCreate(AppBaseModel):
    """POST /articles リクエストボディ（n8nから呼び出し）

    published_at は ISO8601 UTC形式の datetime で受け取る（例: "2026-01-01T00:00:00Z"）。
    n8n側で /ingest の published_at 文字列を datetime に変換して送信すること。
    """
    source_url: str
    source_name: Optional[str] = None
    title_original: Optional[str] = None
    title_ja: Optional[str] = None
    body_original: Optional[str] = None
    body_translated: Optional[str] = None
    summary_ja: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    og_image_url: Optional[str] = None
    categories: Optional[list[str]] = None
    metadata: Optional[dict] = None


# --- レスポンス ---

class ArticleListItem(AppBaseModel):
    """GET /articles レスポンス内の各記事（要約のみ）"""
    id: uuid.UUID
    source_url: str
    source_name: Optional[str] = None
    title_ja: Optional[str] = None
    summary_ja: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    og_image_url: Optional[str] = None
    categories: Optional[list[str]] = None
    created_at: datetime


class ArticleDetail(AppBaseModel):
    """GET /articles/{id} レスポンス（要約 + メタデータ）"""
    id: uuid.UUID
    source_url: str
    source_name: Optional[str] = None
    title_original: Optional[str] = None
    title_ja: Optional[str] = None
    summary_ja: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    og_image_url: Optional[str] = None
    categories: Optional[list[str]] = None
    metadata: Optional[dict] = None
    created_at: datetime


class ArticleListResponse(AppBaseModel):
    """GET /articles ページネーションレスポンス"""
    items: list[ArticleListItem]
    total: int
    page: int
    per_page: int


class ArticleCheckResponse(AppBaseModel):
    """GET /articles/check レスポンス"""
    exists: bool
```

**設計判断:**
- `ArticleDetail`は要約+元記事リンク+メタデータ。`body_original`と`body_translated`は著作権対応（要件§9）で公開APIから除外
- `ArticleListItem`は一覧表示に必要な最小限のフィールド
- `ArticleCreate`は全フィールドを受け付ける（n8nが翻訳・要約結果を一括送信）

### 5.3 Digest スキーマ (schemas/digest.py)

```python
import uuid
from datetime import date, datetime
from typing import Optional

from app.schemas import AppBaseModel


class DigestCreate(AppBaseModel):
    """POST /digest リクエストボディ"""
    digest_date: date
    title: Optional[str] = None
    content: Optional[str] = None
    article_count: Optional[int] = None
    article_ids: Optional[list[uuid.UUID]] = None


class DigestResponse(AppBaseModel):
    """GET /digest/{date} レスポンス"""
    id: uuid.UUID
    digest_date: date
    title: Optional[str] = None
    content: Optional[str] = None
    article_count: Optional[int] = None
    article_ids: Optional[list[uuid.UUID]] = None
    created_at: datetime


class DigestListItem(AppBaseModel):
    """GET /digest 一覧レスポンス内の各ダイジェスト"""
    id: uuid.UUID
    digest_date: date
    title: Optional[str] = None
    article_count: Optional[int] = None
    created_at: datetime


class DigestListResponse(AppBaseModel):
    """GET /digest ページネーションレスポンス"""
    items: list[DigestListItem]
    total: int
```

### 5.4 Ingest スキーマ (schemas/ingest.py)

```python
from typing import Optional

from app.schemas import AppBaseModel


class IngestRequest(AppBaseModel):
    """POST /ingest リクエストボディ"""
    url: str


class IngestResponse(AppBaseModel):
    """POST /ingest レスポンス（本文抽出結果）

    published_at は trafilatura が返す日付文字列をそのまま返す（例: "2026-01-01"）。
    ISO8601形式の文字列。datetime への変換責務は呼び出し元（n8n）にある。
    n8n が POST /articles で送信する際に datetime (ISO8601 UTC) に変換すること。
    """
    title: Optional[str] = None
    body: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[str] = None
    og_image_url: Optional[str] = None
```

### 5.5 Health スキーマ (schemas/health.py)

```python
from app.schemas import AppBaseModel


class HealthResponse(AppBaseModel):
    """GET /health レスポンス"""
    status: str
    db: str
```

---

## 6. APIエンドポイント設計

### 6.1 ルーター一覧

| ルーターファイル | プレフィックス | タグ |
|-----------------|--------------|------|
| health.py | (なし) | health |
| ingest.py | (なし) | ingest |
| articles.py | /articles | articles |
| digest.py | /digest | digest |

### 6.2 エンドポイント詳細

#### GET /health

```
レスポンス 200:
{
  "status": "healthy",
  "db": "connected"
}

レスポンス 503 (DB接続失敗時):
{
  "status": "unhealthy",
  "db": "disconnected"
}
```

**処理:**
1. `SELECT 1`をDBに発行して接続確認
2. 成功→200、失敗→503

#### POST /ingest

```
リクエスト:
{
  "url": "https://techcrunch.com/2026/01/01/example-article"
}

レスポンス 200:
{
  "title": "Example Article Title",
  "body": "Full article body text extracted by trafilatura...",
  "author": "John Doe",
  "published_at": "2026-01-01",
  "og_image_url": "https://techcrunch.com/og-image.jpg"
}

レスポンス 422 (抽出失敗):
{
  "detail": "Failed to extract content from URL"
}
```

**処理:**
1. `trafilatura.fetch_url(url)`でHTML取得
2. `trafilatura.bare_extraction(html, url=url, with_metadata=True)`で抽出
3. Documentオブジェクトから`title`, `text`, `author`, `date`, `image`を取得
4. レスポンスとして返却（**DBには保存しない**）
5. fetch_url失敗またはbare_extraction結果がNoneの場合は422エラー

**`published_at`の型フロー:**
- trafilatura `doc.date`は日付文字列を返す（例: `"2026-01-01"`）
- `/ingest`レスポンスではそのまま`str`として返却
- n8n側で`datetime` (ISO8601 UTC) に変換し、`POST /articles`で送信
- `ArticleCreate.published_at`は`Optional[datetime]`で受け取り、timezone-awareとしてDB保存

**trafilatura v2.0 API使用パターン:**
```python
from trafilatura import fetch_url, bare_extraction

downloaded = fetch_url(url)
if downloaded is None:
    raise HTTPException(status_code=422, detail="Failed to fetch URL")

doc = bare_extraction(downloaded, url=url, with_metadata=True)
if doc is None:
    raise HTTPException(status_code=422, detail="Failed to extract content from URL")

return IngestResponse(
    title=doc.title,
    body=doc.text,
    author=doc.author,
    published_at=doc.date,
    og_image_url=doc.image,
)
```

#### GET /articles/check

```
リクエスト: GET /articles/check?url=https://example.com/article

レスポンス 200:
{
  "exists": true
}
```

**処理:**
1. `source_url`カラムで`WHERE source_url = :url`検索
2. レコード存在→`true`、不存在→`false`

#### POST /articles

```
リクエスト:
{
  "source_url": "https://techcrunch.com/...",
  "source_name": "TechCrunch",
  "title_original": "Original Title",
  "title_ja": "日本語タイトル",
  "body_original": "Original body...",
  "body_translated": "翻訳本文...",
  "summary_ja": "日本語要約...",
  "author": "John Doe",
  "published_at": "2026-01-01T00:00:00Z",
  "og_image_url": "https://...",
  "categories": ["AI", "Startups"],
  "metadata": {"extra": "data"}
}

レスポンス 201:
{
  "id": "uuid-here",
  "source_url": "...",
  ...
  "created_at": "2026-01-01T12:00:00Z"
}

レスポンス 409 (重複URL):
{
  "detail": "Article with this URL already exists"
}
```

**処理:**
1. `source_url`のUNIQUE制約違反チェック（`IntegrityError`捕捉）
2. Articleモデル生成→DB保存
3. 重複時は409 Conflict

#### GET /articles

```
リクエスト: GET /articles?page=1&per_page=20&date=2026-01-01

レスポンス 200:
{
  "items": [
    {
      "id": "uuid",
      "source_url": "...",
      "source_name": "TechCrunch",
      "title_ja": "日本語タイトル",
      "summary_ja": "要約テキスト...",
      "author": "John Doe",
      "published_at": "2026-01-01T00:00:00Z",
      "og_image_url": "...",
      "categories": ["AI"],
      "created_at": "2026-01-01T12:00:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 20
}
```

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| page | int | 1 | ページ番号（1始まり） |
| per_page | int | 20 | 1ページあたりの件数（最大100） |
| date | str (YYYY-MM-DD) | なし | 公開日フィルタ |

**処理:**
1. `published_at`の降順ソート
2. dateパラメータがあればその日の記事のみ
3. OFFSET/LIMITでページネーション
4. `COUNT(*)`で総数取得

#### GET /articles/{id}

```
レスポンス 200: ArticleDetail
レスポンス 404: {"detail": "Article not found"}
```

**処理:**
1. UUIDで検索
2. 存在しなければ404

#### POST /digest

```
リクエスト:
{
  "digest_date": "2026-01-01",
  "title": "2026年1月1日のテックニュースまとめ",
  "content": "本日のハイライト...",
  "article_count": 15,
  "article_ids": ["uuid-1", "uuid-2", ...]
}

レスポンス 201: DigestResponse
レスポンス 409 (同日重複):
{
  "detail": "Digest for this date already exists"
}
```

**処理:**
1. `digest_date`のUNIQUE制約違反チェック
2. Digestモデル生成→DB保存

#### GET /digest

```
レスポンス 200:
{
  "items": [
    {
      "id": "uuid",
      "digest_date": "2026-01-01",
      "title": "まとめタイトル",
      "article_count": 15,
      "created_at": "2026-01-01T23:00:00Z"
    }
  ],
  "total": 30
}
```

**処理:**
1. `digest_date`降順ソート
2. 全件返却（ダイジェストは1日1件のため、ページネーションは不要）

#### GET /digest/{date}

```
リクエスト: GET /digest/2026-01-01

レスポンス 200: DigestResponse
レスポンス 404: {"detail": "Digest not found"}
```

**処理:**
1. `digest_date`で検索（YYYY-MM-DD形式）
2. 存在しなければ404

---

## 7. サービス層設計

### 7.1 IngestService (services/ingest_service.py)

```python
from trafilatura import fetch_url, bare_extraction
from app.schemas.ingest import IngestResponse


def extract_article(url: str) -> IngestResponse | None:
    """URLから本文とメタデータを抽出する。

    trafilatura.fetch_url()はブロッキングIOのため、
    FastAPIのasyncエンドポイントからは run_in_executor で呼び出す
    か、同期関数としてルーターから呼び出す。

    Returns:
        IngestResponse or None (抽出失敗時)
    """
    downloaded = fetch_url(url)
    if downloaded is None:
        return None

    doc = bare_extraction(downloaded, url=url, with_metadata=True)
    if doc is None:
        return None

    return IngestResponse(
        title=doc.title,
        body=doc.text,
        author=doc.author,
        published_at=doc.date,
        og_image_url=doc.image,
    )
```

**設計判断:**
- trafilaturaはブロッキングIOライブラリ。asyncイベントループをブロックしないよう、ルーター側で`def`（同期）エンドポイントとして定義するか、`asyncio.to_thread()`で呼び出す
- FastAPIは`def`エンドポイントを自動的にスレッドプールで実行するため、`def`エンドポイントが最もシンプル

### 7.2 ArticleService (services/article_service.py)

```python
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.schemas.article import ArticleCreate


async def check_article_exists(session: AsyncSession, url: str) -> bool:
    result = await session.execute(
        select(func.count()).where(Article.source_url == url)
    )
    return result.scalar_one() > 0


async def create_article(session: AsyncSession, data: ArticleCreate) -> Article:
    article = Article(**data.model_dump())
    session.add(article)
    await session.flush()
    return article


async def get_articles(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    date_filter: Optional[date] = None,
) -> tuple[list[Article], int]:
    query = select(Article)

    if date_filter:
        # TIMESTAMPTZ を UTC の日付範囲でフィルタ
        start = datetime(date_filter.year, date_filter.month, date_filter.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = query.where(Article.published_at >= start, Article.published_at < end)

    # 総数取得
    count_result = await session.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    # ページネーション
    query = query.order_by(Article.published_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await session.execute(query)
    articles = list(result.scalars().all())

    return articles, total


async def get_article_by_id(session: AsyncSession, article_id: uuid.UUID) -> Article | None:
    result = await session.execute(
        select(Article).where(Article.id == article_id)
    )
    return result.scalar_one_or_none()
```

**設計判断:**
- `flush()`でIDを確定させるが、`commit()`はセッション依存関数に委譲
- ページネーションは`OFFSET/LIMIT`方式（Phase 1 MVPで十分）
- 日付フィルタは`published_at`のUTC半開区間`[start, start+1day)`で検索（`23:59:59`方式のマイクロ秒ギャップ回避）

### 7.3 DigestService (services/digest_service.py)

```python
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.digest import Digest
from app.schemas.digest import DigestCreate


async def create_digest(session: AsyncSession, data: DigestCreate) -> Digest:
    digest = Digest(**data.model_dump())
    session.add(digest)
    await session.flush()
    return digest


async def get_digests(session: AsyncSession) -> tuple[list[Digest], int]:
    count_result = await session.execute(select(func.count()).select_from(Digest))
    total = count_result.scalar_one()

    result = await session.execute(
        select(Digest).order_by(Digest.digest_date.desc())
    )
    digests = list(result.scalars().all())
    return digests, total


async def get_digest_by_date(session: AsyncSession, digest_date: date) -> Digest | None:
    result = await session.execute(
        select(Digest).where(Digest.digest_date == digest_date)
    )
    return result.scalar_one_or_none()
```

---

## 8. Alembic マイグレーション設計

### 8.1 初期化

```bash
cd api
alembic init -t async alembic
```

`-t async`テンプレートにより、`env.py`が`async_engine_from_config`を使用する非同期対応で生成される。

### 8.2 env.py 設計方針

```python
# alembic/env.py の要点

# 1. settings から DATABASE_URL を取得してオーバーライド
from app.config import Settings
settings = Settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

# 2. 全モデルをインポートしてBase.metadataに登録
from app.models import Article, Digest, Source  # noqa: F401
from app.database import Base
target_metadata = Base.metadata

# 3. NullPool使用（マイグレーション用）
from sqlalchemy.pool import NullPool
# async_engine_from_config(..., poolclass=NullPool)
```

### 8.3 初期マイグレーション

```bash
alembic revision --autogenerate -m "create initial tables"
alembic upgrade head
```

生成される3テーブル: `articles`, `digests`, `sources`

---

## 9. フロントエンド設計（news-frontend）

### 9.1 プロジェクト構造

```
frontend/
├── public/
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # ルートレイアウト（ヘッダー、フッター）
│   │   ├── page.tsx                # トップページ（最新記事一覧）
│   │   ├── not-found.tsx           # 404ページ
│   │   ├── articles/
│   │   │   ├── page.tsx            # 記事一覧 (/articles)
│   │   │   └── [id]/
│   │   │       └── page.tsx        # 記事詳細 (/articles/[id])
│   │   └── digest/
│   │       ├── page.tsx            # ダイジェスト一覧 (/digest)
│   │       └── [date]/
│   │           └── page.tsx        # 日付指定ダイジェスト (/digest/[date])
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── ArticleCard.tsx
│   │   └── DigestCard.tsx
│   └── lib/
│       ├── api.ts                  # API呼び出し関数群
│       └── types.ts                # TypeScript型定義
├── next.config.ts
├── package.json
├── tsconfig.json
└── Dockerfile
```

### 9.2 Next.js設定 (next.config.ts)

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',  // Docker本番イメージの最小化用
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',  // OG画像は様々なドメインから取得される
      },
    ],
  },
}

export default nextConfig
```

**設計判断:**

`output: 'export'`（完全静的SSG）を**採用しない**理由:
- SSGの`generateStaticParams()`はビルド時にAPIを呼び出す設計だが、`docker build`中のフロントエンドコンテナは`news-api`ホストを名前解決できない
- Docker build中にAPIへ到達する手段（ビルド用ネットワーク、事前JSON書き出し等）はMVPには過剰な複雑さ

**代替方針: Node.jsサーバーモードでのランタイムfetch:**
- `next start`でNode.jsサーバーを起動し、Server Componentsがリクエスト時にAPIを呼び出す
- コンテナ起動後はDocker Composeネットワーク内でAPIに到達可能
- Phase 2以降でISR（Incremental Static Regeneration）を導入し、キャッシュ付きの準静的配信に移行可能

### 9.3 データ取得パターン (lib/api.ts)

```typescript
const API_BASE = process.env.API_URL || 'http://news-api:8100'

export async function getArticles(page: number = 1): Promise<ArticleListResponse> {
  const res = await fetch(`${API_BASE}/articles?page=${page}&per_page=20`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch articles')
  return res.json()
}

export async function getArticleById(id: string): Promise<ArticleDetail> {
  const res = await fetch(`${API_BASE}/articles/${id}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Failed to fetch article: ${id}`)
  return res.json()
}

export async function getDigests(): Promise<DigestListResponse> {
  const res = await fetch(`${API_BASE}/digest`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch digests')
  return res.json()
}

export async function getDigestByDate(date: string): Promise<DigestResponse> {
  const res = await fetch(`${API_BASE}/digest/${date}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Failed to fetch digest: ${date}`)
  return res.json()
}
```

**fetchキャッシュ方針:**
- Phase 1 MVPでは全API呼び出しに`cache: 'no-store'`を指定し、常に最新データを取得する
- Server Componentsのデフォルト`fetch`はキャッシュが有効なため、明示的に無効化しないと記事更新が反映されない
- Phase 2以降で`next: { revalidate: 60 }`（60秒ISR）に移行し、パフォーマンスと鮮度のバランスを取る

### 9.4 Server Componentパターン

#### 記事一覧ページ (articles/page.tsx)

```typescript
import { getArticles } from '@/lib/api'

export default async function ArticlesPage() {
  const data = await getArticles(1)
  return (
    <main>
      {data.items.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </main>
  )
}
```

#### 記事詳細ページ (articles/[id]/page.tsx)

```typescript
import { notFound } from 'next/navigation'
import { getArticleById } from '@/lib/api'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  try {
    const article = await getArticleById(id)
    // ...render
  } catch {
    notFound()
  }
}
```

#### ダイジェストページ (digest/[date]/page.tsx)

```typescript
import { notFound } from 'next/navigation'
import { getDigestByDate } from '@/lib/api'

export default async function DigestPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  try {
    const digest = await getDigestByDate(date)
    // ...render
  } catch {
    notFound()
  }
}
```

**設計判断:**
- Server Componentsがリクエスト時にAPIを呼び出す（ランタイムfetch）
- `generateStaticParams()`は使用しない（ビルド時にAPIに到達できないため）
- `params`が`Promise`型: Next.js 16でのパラメータ非同期化対応
- `API_URL`環境変数はサーバー側のみ（`NEXT_PUBLIC_`プレフィックス不要）
- 存在しないリソースへのアクセスは`notFound()`で404を返す

---

## 10. Docker設計

### 10.1 docker-compose.yml

```yaml
services:
  news-db:
    image: postgres:16
    environment:
      POSTGRES_USER: news
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: news_curator
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U news -d news_curator"]
      interval: 10s
      timeout: 5s
      retries: 5

  news-api:
    build:
      context: ./api
      dockerfile: Dockerfile
    image: <your-registry>/news-curator/api:latest
    ports:
      - "8100:8100"
    environment:
      DATABASE_URL: postgresql+asyncpg://news:${POSTGRES_PASSWORD}@news-db:5432/news_curator
      ENVIRONMENT: production
    depends_on:
      news-db:
        condition: service_healthy

  news-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    image: <your-registry>/news-curator/frontend:latest
    ports:
      - "3100:3000"
    environment:
      API_URL: http://news-api:8100
    depends_on:
      - news-api

volumes:
  postgres_data:
```

### 10.2 docker-compose.dev.yml（開発用オーバーライド）

```yaml
services:
  news-api:
    build:
      context: ./api
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql+asyncpg://news:devpassword@news-db:5432/news_curator
      ENVIRONMENT: development
    volumes:
      - ./api:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload

  news-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: dev
    environment:
      API_URL: http://news-api:8100
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev

  news-db:
    environment:
      POSTGRES_PASSWORD: devpassword
```

### 10.3 API Dockerfile (api/Dockerfile)

```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

# 依存関係のみ先にインストール（キャッシュ活用）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY . .

# マイグレーションは起動コマンドに含めない（make migrate-up で別途実行）
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
```

**マイグレーション実行方針:**
- コンテナ起動時の自動マイグレーションは行わない（複数インスタンス起動時の競合リスク回避）
- デプロイ時に`make migrate-up`を単独ステップとして実行する
- Makefileの`up`ターゲットにマイグレーション→起動の順序を定義（§13参照）

### 10.4 Frontend Dockerfile (frontend/Dockerfile)

```dockerfile
# ビルドステージ
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 本番ステージ（Next.js Node.jsサーバー）
FROM node:20-slim AS production
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
ENV API_URL=http://news-api:8100
EXPOSE 3000
CMD ["node", "server.js"]

# 開発ステージ
FROM node:20-slim AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

**設計判断:**
- Node.jsサーバーモード: Server ComponentsがランタイムでAPIを呼び出す
- `output: 'standalone'`を`next.config.ts`に設定し、本番イメージを最小化
- `API_URL`はサーバー側環境変数（`NEXT_PUBLIC_`不要。Server Componentsのみが使用）
- ビルド時にAPIへの接続は不要（ランタイムfetchのため）
- `dev`ターゲット: `docker-compose.dev.yml`で`target: dev`指定用

---

## 11. テスト設計

### 11.1 テスト方針

| レベル | 対象 | DB | 方式 |
|-------|------|-----|------|
| 単体テスト | 全エンドポイント | PostgreSQL (testcontainers) | httpx AsyncClient + ASGITransport |

**PostgreSQL（testcontainers）を使用する理由:**
- 本番と同一のDBエンジンでテスト。ARRAY、JSONB、TIMESTAMPTZ等のPostgreSQL固有型がそのまま動作
- SQLiteとの型互換性問題（ARRAY/JSONB非対応で`create_all`失敗）を完全に回避
- testcontainersが自動でPostgreSQLコンテナを起動・破棄するため手動管理不要
- テスト実行にDocker環境が必要（CI環境でもDocker-in-Docker等で対応可能）

### 11.2 テストフィクスチャ (tests/conftest.py)

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.main import app
from app.database import get_session, Base


@pytest.fixture(scope="session")
def postgres_container():
    """セッション全体で1つのPostgreSQLコンテナを共有する。

    driver=None で起動し、get_connection_url() 時に asyncpg を指定する。
    コンストラクタに driver="asyncpg" を渡すと、初期化時の同期ヘルスチェックで
    greenlet エラーが発生する場合があるため回避する。
    """
    with PostgresContainer("postgres:16", driver=None) as postgres:
        yield postgres


@pytest.fixture(scope="function")
async def db_engine(postgres_container):
    """テストごとにテーブルを再作成する。"""
    url = postgres_container.get_connection_url(driver="asyncpg")
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="function")
async def db_session(db_engine):
    session_factory = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session


@pytest.fixture(scope="function")
async def client(db_session):
    app.dependency_overrides[get_session] = lambda: db_session
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
```

**フィクスチャ設計:**
- `postgres_container`はsessionスコープ: テストセッション全体で1コンテナ共有（起動コスト削減）
- `db_engine`はfunctionスコープ: テストごとにcreate_all/drop_allでテーブルを再作成（テスト間分離）
- `NullPool`: テスト用エンジンではコネクションプール不要

### 11.3 テストケース一覧

#### test_health.py
| テスト | 説明 |
|-------|------|
| `test_health_ok` | 正常時に`{"status": "healthy", "db": "connected"}`を返す |

#### test_ingest.py
| テスト | 説明 |
|-------|------|
| `test_ingest_success` | 有効なURLで本文抽出が成功する（trafilaturaモック） |
| `test_ingest_fetch_failure` | URL取得失敗時に422を返す |
| `test_ingest_extract_failure` | 本文抽出失敗時に422を返す |

#### test_articles.py
| テスト | 説明 |
|-------|------|
| `test_create_article` | 記事作成が成功しUUIDが返る |
| `test_create_article_duplicate` | 同一URLで409を返す |
| `test_check_article_exists` | 存在する記事URLで`exists: true` |
| `test_check_article_not_exists` | 存在しないURLで`exists: false` |
| `test_list_articles` | ページネーション付き一覧取得 |
| `test_list_articles_date_filter` | 日付フィルタ動作 |
| `test_get_article_detail` | ID指定で記事詳細取得 |
| `test_get_article_not_found` | 存在しないIDで404 |

#### test_digest.py
| テスト | 説明 |
|-------|------|
| `test_create_digest` | ダイジェスト作成成功 |
| `test_create_digest_duplicate_date` | 同日重複で409 |
| `test_list_digests` | ダイジェスト一覧取得 |
| `test_get_digest_by_date` | 日付指定でダイジェスト取得 |
| `test_get_digest_not_found` | 存在しない日付で404 |

### 11.4 pytest設定 (pyproject.toml)

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

---

## 12. 依存パッケージ

### 12.1 requirements.txt（本番用）

Dockerイメージに含まれる依存のみ。テスト関連は含めない。

```
fastapi>=0.128.0,<0.130.0
pydantic>=2.12.0,<3.0.0
pydantic-settings>=2.12.0
sqlalchemy[asyncio]>=2.0.46,<2.1.0
alembic>=1.18.0,<1.19.0
asyncpg>=0.31.0
uvicorn[standard]>=0.40.0
trafilatura>=2.0.0
```

### 12.2 requirements-dev.txt（開発・テスト用）

ローカル開発とテスト実行時に追加インストール。

```
-r requirements.txt
httpx>=0.28.1
pytest>=9.0
pytest-asyncio>=1.3.0
testcontainers[postgres]>=4.8.2
asgi-lifespan>=2.1.0
```

**設計判断:**
- 本番イメージのサイズ削減と不要依存の排除のため分離
- `requirements-dev.txt`は`-r requirements.txt`で本番依存を継承
- Dockerfile は `requirements.txt` のみインストール
- ローカル開発では `pip install -r requirements-dev.txt` で全依存をインストール

---

## 13. Makefile

```makefile
.PHONY: dev up down build test migrate migrate-up deploy push

# 開発環境起動
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# 本番起動（マイグレーションなし、アプリのみ）
up:
	docker compose up -d

# 停止
down:
	docker compose down

# ビルド
build:
	docker compose build

# テスト実行（Docker必要: testcontainersがPostgreSQLコンテナを自動起動）
# 事前に pip install -r api/requirements-dev.txt が必要
test:
	cd api && python -m pytest tests/ -v

# マイグレーション作成
migrate:
	cd api && alembic revision --autogenerate -m "$(msg)"

# マイグレーション適用（news-apiコンテナ内で実行）
migrate-up:
	docker compose exec news-api alembic upgrade head

# デプロイ（マイグレーション→起動の順序実行）
deploy:
	docker compose up -d news-db
	docker compose up -d news-api
	docker compose exec news-api alembic upgrade head
	docker compose up -d news-frontend

# レジストリへpush
push:
	docker push <your-registry>/news-curator/api:latest
	docker push <your-registry>/news-curator/frontend:latest
```

---

## 14. 環境変数一覧

### 14.1 .env（docker-compose用）

```
POSTGRES_PASSWORD=<secure-password>
```

### 14.2 news-api

| 変数 | 必須 | 説明 | 例 |
|------|------|------|-----|
| DATABASE_URL | Yes | PostgreSQL接続文字列 | `postgresql+asyncpg://news:pass@news-db:5432/news_curator` |
| ENVIRONMENT | No | 環境識別子 | `development` / `production` |

### 14.3 news-frontend

| 変数 | 必須 | 説明 | 例 |
|------|------|------|-----|
| API_URL | Yes (ランタイム) | APIエンドポイント（Server Components用） | `http://news-api:8100` |

### 14.4 news-db

| 変数 | 必須 | 説明 | 例 |
|------|------|------|-----|
| POSTGRES_USER | Yes | DBユーザー | `news` |
| POSTGRES_PASSWORD | Yes | DBパスワード | `<secure-password>` |
| POSTGRES_DB | Yes | DB名 | `news_curator` |

---

## 15. 実装順序（推奨）

以下の順序で実装することを推奨する。各ステップは前ステップへの依存がある。

| # | 対象 | 成果物 |
|---|------|--------|
| 1 | プロジェクト骨格 | `api/`ディレクトリ構造、`requirements.txt`、`pyproject.toml` |
| 2 | 設定・DB接続 | `config.py`, `database.py` |
| 3 | ORMモデル | `models/article.py`, `models/digest.py`, `models/source.py` |
| 4 | Alembic初期設定 | `alembic/`, 初期マイグレーション |
| 5 | Pydanticスキーマ | `schemas/` 全ファイル |
| 6 | サービス層 | `services/` 全ファイル |
| 7 | ルーター（API） | `routers/` 全ファイル、`main.py`ルーター登録 |
| 8 | テスト | `tests/` 全ファイル |
| 9 | Docker（API） | `api/Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml` |
| 10 | フロントエンド骨格 | `frontend/`ディレクトリ構造、`package.json`, `next.config.ts` |
| 11 | フロントエンド実装 | ページコンポーネント、APIクライアント |
| 12 | Docker（フロントエンド） | `frontend/Dockerfile`, docker-compose追加 |
| 13 | Makefile | `Makefile` |
| 14 | 統合確認 | `docker compose up`で全体動作確認 |

---

## Appendix A: エラーレスポンス形式

全エンドポイントで統一されたエラー形式を使用する（FastAPIデフォルト）:

```json
{
  "detail": "エラーメッセージ"
}
```

| HTTPステータス | 用途 |
|---------------|------|
| 400 | バリデーションエラー（FastAPI自動） |
| 404 | リソース未検出 |
| 409 | 重複（UNIQUE制約違反） |
| 422 | 処理不能（本文抽出失敗等） |
| 500 | 内部エラー |
| 503 | DB接続不可（ヘルスチェック） |
