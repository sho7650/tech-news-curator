# Phase 2 設計書 — 公開版

> **Version**: 3.3
> **Date**: 2026-02-12
> **Base**: REQUIREMENTS-v2.0.md §2.8–§2.10, §8.4, §11 Phase 2
> **Status**: 実装完了

---

## 変更履歴

| Version | Date | 変更内容 |
|---------|------|----------|
| 1.0 | 2025-02-06 | 初版（Phase 1.0 MVP） |
| 1.1 | 2025-02 | 設計レビュー修正版 |
| 2.0 | 2026-02-11 | Phase 1.2 セキュリティ強化・品質向上 |
| 2.1 | 2026-02-12 | Phase 1.2 実装中修正 |
| 3.0 | 2026-02-12 | Phase 2 公開版設計 |
| 3.1 | 2026-02-12 | レビュー指摘対応（§4.3カテゴリ+無限スクロール/SSE整合、§10.2 Playwright URL統一、§10.3 E2Eデータ準備、§7.3 CSP開発環境修正、§6.2 SSE接続URL統一、§6.2.5 extractUniqueCategories定義、§2.2 PostgreSQL 16.11維持、§3.2 SourceUpdate null防止） |
| 3.2 | 2026-02-12 | レビュー指摘対応（§4.5 apiBase参照追記、§6.2 getCategories docstring修正、§3.2 site_url HttpUrl化、§7.1 CSP方針テキスト修正、§9.2 ZAP_API_KEY単一キー化） |
| 3.3 | 2026-02-12 | レビュー指摘対応（§8.2/§8.5 SSL server.key を owner:999:999 に統一、§7.3 RSS フィードを CSP 除外、§6.2 searchParams Promise 根拠コメント追記） |

---

## 1. 概要

Phase 2 は、Phase 1.2 で確立したセキュリティ基盤の上に、以下 4 領域の機能拡張を行う。

1. **ソース管理 API** — RSS ソースの CRUD エンドポイント（GET/POST/PUT/DELETE /sources）
2. **カテゴリ・タグ分類** — 記事のカテゴリフィルタリング（GET /articles?category=ai）
3. **RSS 配信** — RSS 2.0 フィード生成（GET /feed/rss）
4. **セキュリティ・インフラ・テスト強化** — フロントエンド CSP、PostgreSQL SSL/TLS、OWASP ZAP DAST、Playwright E2E テスト、Node.js 22.x 移行

**設計原則**: Phase 1.2 で構築した認証・レート制限・セキュリティヘッダーの仕組みをそのまま活用し、新規エンドポイントに一貫して適用する。既存のルーター → サービス → データベースのリクエストフローパターンを踏襲する。

### 1.1 スコープ外

以下は Phase 2 では実装しない（REQUIREMENTS-v2.0.md §12 参照）:

- JWT 認証・OAuth（Phase 3）
- ユーザー管理・ユーザーテーブル（Phase 3）
- Newsletter 配信（Phase 3）
- Stripe 連携（Phase 3）
- n8n ワークフロー構築（別管理）
- Ollama 設定（別管理）

---

## 2. 技術スタック追加・バージョン確定

### 2.1 新規依存パッケージ

| パッケージ | バージョン | 用途 | 追加先 |
|-----------|-----------|------|--------|
| feedgen | 1.0.0 | RSS 2.0 フィード生成 | `api/requirements.txt` |
| @playwright/test | latest | E2E テスト | `frontend/package.json` (devDependencies) |

> **根拠**: feedgen 1.0.0 は Python で RSS/ATOM フィードを生成する標準ライブラリ。`fg.rss_str()` で RSS 2.0 XML を生成可能。lxml ベースで高速。
> **出典**: [feedgen PyPI](https://pypi.org/project/feedgen/), [feedgen API Documentation](https://feedgen.kiesow.be/api.html)

### 2.2 Docker ベースイメージ更新

| イメージ | Phase 1.2 | Phase 2 | 根拠 |
|---------|-----------|---------|------|
| Node.js | `node:20.20.0-slim` | `node:22.14.0-slim` | Node.js 20.x は 2026-04-30 に EOL。Node.js 22.x LTS に移行 |
| PostgreSQL | `postgres:16.11` | `postgres:16.11`（変更なし） | 2026-02-12 時点で 16.12 は未リリース。リリース後に別 PR で更新 |
| Python | `python:3.12.12-slim` | 変更なし | 現行で最新 |

> **出典**: [Node.js Release Schedule](https://nodejs.org/en/about/previous-releases), [Node.js 22.14.0](https://nodejs.org/en/blog/release/v22.14.0)
>
> **注意**: Node.js 22.x 移行に伴い、`frontend/Dockerfile` の全ステージ（builder, production, dev）のベースイメージを更新する。Next.js 16.1.6 は Node.js 22.x をサポートしている。
>
> **v3.1 修正 — PostgreSQL 16.12**: 16.12 は 2026-02-12 時点で未リリースのため、16.11 を維持する。16.12 リリース確認後に Docker イメージバージョン更新の PR を別途作成する。

### 2.3 CORS 設定変更

Phase 2 でソース管理の PUT/DELETE エンドポイントを追加するため、CORS の `allow_methods` を拡張する。

| 項目 | Phase 1.2 | Phase 2 |
|------|-----------|---------|
| `allow_methods` | `["GET", "POST"]` | `["GET", "POST", "PUT", "DELETE"]` |

**変更箇所**: `api/app/main.py` の `CORSMiddleware` 設定。

---

## 3. ソース管理 API 設計

### 3.1 エンドポイント一覧

| Method | Path | Caller | Auth | Rate Limit | Description |
|--------|------|--------|------|------------|-------------|
| GET | `/sources` | Frontend/Admin | なし | 60/minute | ソース一覧 |
| POST | `/sources` | Admin | API Key | 10/minute | ソース追加 |
| PUT | `/sources/{id}` | Admin | API Key | 10/minute | ソース更新 |
| DELETE | `/sources/{id}` | Admin | API Key | 10/minute | ソース無効化（論理削除） |

> **根拠**: REQUIREMENTS-v2.0.md §2.8 に準拠。DELETE は物理削除ではなく `is_active=False` の論理削除とする。これにより既存の記事データとの参照整合性を維持する。

### 3.2 Pydantic スキーマ — `api/app/schemas/source.py`（新規）

```python
import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field, HttpUrl, model_validator

from app.schemas import AppBaseModel


class SourceCreate(AppBaseModel):
    """POST /sources request body."""

    name: str = Field(..., min_length=1, max_length=100)
    rss_url: HttpUrl
    site_url: Optional[HttpUrl] = None
    category: Optional[str] = Field(None, max_length=50)


class SourceUpdate(AppBaseModel):
    """PUT /sources/{id} request body.

    全フィールド Optional で部分更新をサポート。
    exclude_unset=True で未送信フィールドは変更しない。
    rss_url/name は明示的 null 送信を禁止（DB NOT NULL 制約保護）。
    """

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    rss_url: Optional[HttpUrl] = None
    site_url: Optional[HttpUrl] = None
    category: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "SourceUpdate":
        """rss_url, name が明示的に null で送信された場合を拒否する。

        exclude_unset=True では「未送信」と「null送信」を区別できるが、
        null が set された場合に DB の NOT NULL 制約で 500 になるのを防ぐ。
        model_fields_set で「送信されたが null」を検出する。
        """
        if "rss_url" in self.model_fields_set and self.rss_url is None:
            raise ValueError("rss_url cannot be null")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class SourceResponse(AppBaseModel):
    """GET /sources, GET /sources/{id} response."""

    id: uuid.UUID
    name: Optional[str] = None
    rss_url: str
    site_url: Optional[str] = None
    category: Optional[str] = None
    is_active: bool
    created_at: datetime


class SourceListResponse(AppBaseModel):
    """GET /sources paginated response."""

    items: list[SourceResponse]
    total: int
    page: int
    per_page: int
```

**設計判断**:

| 判断 | 理由 |
|------|------|
| `SourceCreate.name` は必須（`...`） | ソース名なしでは管理画面で識別不可能 |
| `SourceCreate.rss_url` / `site_url` は `HttpUrl` 型 | Pydantic のスキーム・ホスト検証を活用。無効な URL の DB 格納を防止。SSRF は n8n 側で RSS を取得するため API 側では不要 |
| `SourceUpdate` は全フィールド Optional | 部分更新（PATCH セマンティクス）を PUT で実現。未指定フィールドは変更しない |
| `SourceUpdate.rss_url`/`name` の null 送信を拒否 | `model_validator(mode="after")` + `model_fields_set` で「送信されたが null」を検出し、DB NOT NULL 制約違反（500）を 422 に変換 |
| `extra="forbid"` | `AppBaseModel` から継承。未知フィールドを拒否 |

### 3.3 サービス層 — `api/app/services/source_service.py`（新規）

```python
import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.source import Source
from app.schemas.source import SourceCreate, SourceUpdate


async def create_source(session: AsyncSession, data: SourceCreate) -> Source:
    dump = data.model_dump()
    dump["rss_url"] = str(data.rss_url)
    if data.site_url:
        dump["site_url"] = str(data.site_url)
    source = Source(**dump)
    session.add(source)
    await session.flush()
    return source


async def get_sources(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    active_only: bool = False,
) -> tuple[list[Source], int]:
    query = select(Source)
    if active_only:
        query = query.where(Source.is_active.is_(True))

    count_result = await session.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    result = await session.execute(
        query.order_by(Source.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    sources = list(result.scalars().all())
    return sources, total


async def get_source_by_id(
    session: AsyncSession, source_id: uuid.UUID
) -> Source | None:
    result = await session.execute(
        select(Source).where(Source.id == source_id)
    )
    return result.scalar_one_or_none()


async def update_source(
    session: AsyncSession,
    source: Source,
    data: SourceUpdate,
) -> Source:
    update_data = data.model_dump(exclude_unset=True)
    if "rss_url" in update_data and update_data["rss_url"] is not None:
        update_data["rss_url"] = str(update_data["rss_url"])
    if "site_url" in update_data and update_data["site_url"] is not None:
        update_data["site_url"] = str(update_data["site_url"])
    for key, value in update_data.items():
        setattr(source, key, value)
    await session.flush()
    return source


async def deactivate_source(
    session: AsyncSession,
    source: Source,
) -> Source:
    source.is_active = False
    await session.flush()
    return source
```

**設計判断**:

| 判断 | 理由 |
|------|------|
| `update_source` は `exclude_unset=True` で差分のみ適用 | PUT でもクライアントが送信したフィールドのみ更新。`None` の明示送信と「未送信」を区別 |
| `deactivate_source` は独立関数 | DELETE エンドポイントのセマンティクスを明確化。`is_active=False` のみ設定 |
| `HttpUrl` → `str` 変換 | `create_article` と同様のパターン。SQLAlchemy Text 型への格納 |
| `get_sources` に `active_only` パラメータ | フロントエンド表示用（アクティブのみ）と管理用（全件）の切り替え |

### 3.4 ルーター — `api/app/routers/sources.py`（新規）

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.database import get_session
from app.dependencies import verify_api_key
from app.rate_limit import limiter
from app.schemas.source import (
    SourceCreate,
    SourceListResponse,
    SourceResponse,
    SourceUpdate,
)
from app.services.source_service import (
    create_source,
    deactivate_source,
    get_source_by_id,
    get_sources,
    update_source,
)

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=SourceListResponse)
@limiter.limit("60/minute")
async def list_sources(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    active_only: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    sources, total = await get_sources(session, page, per_page, active_only)
    return SourceListResponse(
        items=sources, total=total, page=page, per_page=per_page
    )


@router.post("", response_model=SourceResponse, status_code=201)
@limiter.limit("10/minute")
async def create_source_endpoint(
    request: Request,
    data: SourceCreate,
    session: AsyncSession = Depends(get_session),
    _api_key: str = Security(verify_api_key),
):
    try:
        source = await create_source(session, data)
        return source
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Source with this RSS URL already exists"
        )


@router.put("/{source_id}", response_model=SourceResponse)
@limiter.limit("10/minute")
async def update_source_endpoint(
    request: Request,
    source_id: uuid.UUID,
    data: SourceUpdate,
    session: AsyncSession = Depends(get_session),
    _api_key: str = Security(verify_api_key),
):
    source = await get_source_by_id(session, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    try:
        updated = await update_source(session, source, data)
        return updated
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Source with this RSS URL already exists"
        )


@router.delete("/{source_id}", response_model=SourceResponse)
@limiter.limit("10/minute")
async def delete_source_endpoint(
    request: Request,
    source_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _api_key: str = Security(verify_api_key),
):
    source = await get_source_by_id(session, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    deactivated = await deactivate_source(session, source)
    return deactivated
```

### 3.5 main.py への統合

```python
# api/app/main.py に追加
from app.routers import articles, digest, health, ingest, sources, sse

# ルーター登録（既存の digest の後に追加）
app.include_router(sources.router)
```

**ルーター登録順序**: health → ingest → sse → articles → digest → sources

### 3.6 テスト — `api/tests/test_sources.py`（新規）

| テストケース | 説明 |
|------------|------|
| `test_create_source` | POST /sources で正常にソースを作成 |
| `test_create_source_duplicate` | 同一 rss_url で 409 エラー |
| `test_create_source_no_auth` | API Key なしで 401 エラー |
| `test_list_sources` | GET /sources でソース一覧取得 |
| `test_list_sources_active_only` | `active_only=true` でフィルタリング |
| `test_list_sources_pagination` | ページネーション動作確認 |
| `test_update_source` | PUT /sources/{id} で部分更新 |
| `test_update_source_not_found` | 存在しない ID で 404 エラー |
| `test_update_source_duplicate_url` | rss_url 重複で 409 エラー |
| `test_delete_source` | DELETE /sources/{id} で論理削除 |
| `test_delete_source_not_found` | 存在しない ID で 404 エラー |
| `test_delete_source_verify_deactivation` | 論理削除後に `is_active=false` を確認 |

### 3.7 サービス層テスト — `api/tests/test_source_service.py`（新規）

| テストケース | 説明 |
|------------|------|
| `test_create_source_service` | サービス層でソース作成 |
| `test_get_sources_service` | ソース一覧取得 |
| `test_get_sources_active_only` | アクティブのみフィルタ |
| `test_get_source_by_id` | ID 指定でソース取得 |
| `test_get_source_by_id_not_found` | 存在しない ID で None |
| `test_update_source_partial` | 部分更新の動作確認 |
| `test_deactivate_source` | 論理削除の動作確認 |

---

## 4. カテゴリ・タグ分類設計

### 4.1 概要

REQUIREMENTS-v2.0.md §2.9 に基づき、記事のカテゴリフィルタリングを GET /articles のクエリパラメータで提供する。

**現状**: Article モデルにはすでに `categories: ARRAY(Text)` カラムが存在し、n8n から POST /articles で格納可能。Phase 2 ではこのカラムを利用した**読み取り側フィルタ**を追加する。

### 4.2 エンドポイント変更

**GET /articles** に `category` クエリパラメータを追加:

```
GET /articles?category=ai&page=1&per_page=20
```

| パラメータ | 型 | 制約 | 説明 |
|-----------|-----|------|------|
| `category` | `str \| None` | `max_length=50`, Optional | カテゴリ名でフィルタ（部分一致ではなく完全一致） |

### 4.3 ルーター変更 — `api/app/routers/articles.py`

```python
@router.get("", response_model=ArticleListResponse)
@limiter.limit("60/minute")
async def list_articles(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    category: Optional[str] = Query(None, max_length=50),  # 追加
    session: AsyncSession = Depends(get_session),
):
    date_filter = None
    if date:
        date_filter = _parse_date(date)

    articles, total = await get_articles(
        session, page, per_page, date_filter, category  # category 引数追加
    )
    return ArticleListResponse(
        items=articles, total=total, page=page, per_page=per_page
    )
```

### 4.4 サービス層変更 — `api/app/services/article_service.py`

`get_articles` 関数に `category_filter` パラメータを追加:

```python
async def get_articles(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    date_filter: Optional[date] = None,
    category_filter: Optional[str] = None,  # 追加
) -> tuple[list[Article], int]:
    query = select(Article)

    if date_filter:
        start = datetime(
            date_filter.year, date_filter.month, date_filter.day, tzinfo=timezone.utc
        )
        end = start + timedelta(days=1)
        query = query.where(Article.published_at >= start, Article.published_at < end)

    # カテゴリフィルタ（PostgreSQL ARRAY の ANY 検索）
    if category_filter:
        query = query.where(Article.categories.any(category_filter))

    # ... 以下既存のカウント・ソート・ページネーション
```

**設計判断**:

| 判断 | 理由 |
|------|------|
| `Article.categories.any(value)` | SQLAlchemy の ARRAY 型は `.any()` メソッドで `ANY(array_column)` SQL を生成。PostgreSQL の `= ANY(categories)` 演算子に変換される |
| 完全一致（not ILIKE） | カテゴリ名は n8n が正規化して格納する前提。フロントエンドでの検索は Phase 3 の全文検索で対応 |
| GIN インデックスは見送り | 記事数が数百〜数千件の Phase 2 規模ではインデックスなしで十分。パフォーマンス問題が発生した場合に追加 |

> **根拠**: [SQLAlchemy ARRAY Comparator — any()](https://docs.sqlalchemy.org/en/20/core/type_api.html#sqlalchemy.types.ARRAY.Comparator.any) — `column.any(value)` は `value = ANY(column)` に変換される。

### 4.5 無限スクロール・SSE との整合

カテゴリフィルタは `ArticleListLive` の無限スクロールと SSE 新着通知に影響する。以下の方針で整合性を確保する。

#### 4.5.1 `ArticleListLive` への `category` prop 追加

```typescript
interface Props {
  initialArticles: ArticleListItem[]
  total: number
  initialPage: number
  perPage: number
  category?: string  // 追加: カテゴリフィルタ
}
```

#### 4.5.2 無限スクロールのカテゴリ対応

`loadMore` 関数のフェッチ URL にカテゴリパラメータを含める:

既存の `ArticleListLive.tsx` 内で `const apiBase = '/api'` が定義済み（L63）。この定数をそのまま使用する。

```typescript
// category prop を ref で保持（stale closure 回避）
const categoryRef = useRef(category)
categoryRef.current = category

const loadMore = useCallback(async () => {
  // ...
  const params = new URLSearchParams({
    page: String(nextPage),
    per_page: String(perPage),
  })
  if (categoryRef.current) {
    params.set('category', categoryRef.current)
  }
  // apiBase は '/api'（既存定義。Next.js rewrite 経由で news-api に転送）
  const res = await fetch(`${apiBase}/articles?${params}`, {
    signal: AbortSignal.timeout(10_000),
  })
  // ...
}, [perPage, apiBase])
```

#### 4.5.3 SSE 新着のカテゴリフィルタリング

SSE はサーバー側で全記事をブロードキャストする（SSE broker にフィルタ機能は持たせない）。クライアント側で `category` に一致する記事のみ先頭追加する:

```typescript
es.addEventListener('new_article', (e: MessageEvent) => {
  const article: ArticleListItem = JSON.parse(e.data)
  if (knownIds.current.has(article.id)) return

  // カテゴリフィルタ適用中の場合、一致しない記事は無視
  if (
    categoryRef.current &&
    (!article.categories || !article.categories.includes(categoryRef.current))
  ) {
    return
  }

  knownIds.current.add(article.id)
  setArticles((prev) => [article, ...prev])
  setNewCount((c) => c + 1)
})
```

**設計判断**: SSE サーバー側でのフィルタリングは見送り。理由:
1. SSE broker は全クライアント共通のブロードキャストモデル（per-client フィルタは接続管理が複雑化）
2. 記事数が少ない Phase 2 規模ではクライアント側フィルタで十分
3. Phase 3 でユーザー別カスタマイズ導入時に再設計

#### 4.5.4 カテゴリ変更時のリセット

`category` prop が変更された場合、記事リストを初期状態にリセットする:

```typescript
// category 変更を検知してリセット
const prevCategoryRef = useRef(category)
useEffect(() => {
  if (prevCategoryRef.current !== category) {
    // Server Component が新しい initialArticles を渡すため、
    // ArticleListLive は key={category} でリマウントする方式を推奨
    prevCategoryRef.current = category
  }
}, [category])
```

**推奨方式**: 親コンポーネントで `<ArticleListLive key={category || 'all'} ... />` を使用し、カテゴリ変更時にコンポーネントをリマウントする。これにより state が自然にリセットされ、`knownIds`, `pageRef` 等の ref も初期化される。

### 4.6 テスト追加

**`api/tests/test_articles.py`** に追加:

| テストケース | 説明 |
|------------|------|
| `test_list_articles_category_filter` | `category=ai` で AI カテゴリの記事のみ取得 |
| `test_list_articles_category_no_match` | 存在しないカテゴリで空リスト |
| `test_list_articles_category_and_date` | カテゴリと日付の複合フィルタ |

**`api/tests/test_article_service.py`** に追加:

| テストケース | 説明 |
|------------|------|
| `test_get_articles_category_filter` | サービス層のカテゴリフィルタ |
| `test_get_articles_category_and_date` | 複合フィルタのサービス層テスト |

---

## 5. RSS 配信設計

### 5.1 エンドポイント

| Method | Path | Caller | Auth | Rate Limit | Description |
|--------|------|--------|------|------------|-------------|
| GET | `/feed/rss` | Any | なし | 30/minute | RSS 2.0 フィード |

### 5.2 仕様

| 項目 | 仕様 |
|------|------|
| フォーマット | RSS 2.0 XML |
| Content-Type | `application/rss+xml; charset=utf-8` |
| 内容 | 最新 20 件の記事（`summary_ja` + `source_url`） |
| フィードタイトル | `"Tech News Curator"` |
| フィードリンク | 環境変数 `PUBLIC_URL` で設定（例: `https://news.example.com`） |
| フィード説明 | `"海外テックニュースの日本語要約"` |
| エントリ構成 | title=`title_ja`, link=`source_url`, description=`summary_ja`, pubDate=`published_at`, guid=記事 UUID |
| 著作権対応 | 要約のみ配信。`body_original`, `body_translated` は含まない |

### 5.3 Settings 変更 — `api/app/config.py`

```python
class Settings(BaseSettings):
    # ... 既存フィールド
    public_url: str = "http://localhost:3100"  # 追加: フロントエンドの公開 URL
```

**`.env.example`** に追加:
```
PUBLIC_URL=https://news.example.com
```

### 5.4 サービス層 — `api/app/services/rss_service.py`（新規）

```python
from feedgen.feed import FeedGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import settings
from app.services.article_service import get_articles


async def generate_rss_feed(session: AsyncSession) -> str:
    """最新記事から RSS 2.0 XML を生成する。"""
    articles, _ = await get_articles(session, page=1, per_page=20)

    fg = FeedGenerator()
    fg.title("Tech News Curator")
    fg.link(href=settings.public_url, rel="alternate")
    fg.description("海外テックニュースの日本語要約")
    fg.language("ja")

    for article in articles:
        fe = fg.add_entry()
        fe.id(str(article.id))
        fe.title(article.title_ja or article.title_original or "Untitled")
        fe.link(href=article.source_url)
        if article.summary_ja:
            fe.description(article.summary_ja)
        if article.published_at:
            fe.pubDate(article.published_at)
        if article.author:
            fe.author(name=article.author)

    return fg.rss_str(pretty=True).decode("utf-8")
```

### 5.5 ルーター — `api/app/routers/feed.py`（新規）

```python
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.database import get_session
from app.rate_limit import limiter
from app.services.rss_service import generate_rss_feed

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("/rss")
@limiter.limit("30/minute")
async def rss_feed(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    rss_xml = await generate_rss_feed(session)
    return Response(
        content=rss_xml,
        media_type="application/rss+xml; charset=utf-8",
    )
```

### 5.6 main.py への統合

```python
from app.routers import articles, digest, feed, health, ingest, sources, sse

# ルーター登録
app.include_router(feed.router)
```

**ルーター登録順序**: health → ingest → sse → articles → digest → sources → feed

### 5.7 セキュリティヘッダーの RSS 対応

`SecurityHeadersMiddleware` で RSS フィードパスの CSP を調整する:

```python
# /feed/rss パスでは CSP の default-src 'none' がフィードリーダーの動作を阻害しないよう、
# CSP ヘッダーを付与しない（XML コンテンツのため XSS リスクは低い）
_SKIP_CSP_PATHS = {"/docs", "/redoc", "/openapi.json", "/feed/rss"}
```

### 5.8 テスト — `api/tests/test_feed.py`（新規）

| テストケース | 説明 |
|------------|------|
| `test_rss_feed_empty` | 記事なしで空フィードを返す |
| `test_rss_feed_content` | 記事ありで正しい RSS 2.0 XML を返す |
| `test_rss_feed_content_type` | Content-Type が `application/rss+xml` |
| `test_rss_feed_excludes_body` | `body_original`, `body_translated` がフィードに含まれない |
| `test_rss_feed_max_items` | 最大 20 件の記事を含む |

### 5.9 サービス層テスト — `api/tests/test_rss_service.py`（新規）

| テストケース | 説明 |
|------------|------|
| `test_generate_rss_feed_empty` | 記事なしでも有効な XML を生成 |
| `test_generate_rss_feed_entries` | 記事がエントリとして含まれる |
| `test_generate_rss_feed_encoding` | UTF-8 日本語テキストが正しくエンコード |

---

## 6. フロントエンド拡張設計

### 6.1 ソース一覧ページ

フロントエンドに管理用ソース一覧ページを追加する。Phase 2 では**読み取り専用**の表示のみ。ソースの追加・編集・削除は API 経由（n8n または管理ツール）で行う。

#### 6.1.1 新規ページ — `frontend/src/app/sources/page.tsx`

```typescript
// Server Component
import { getSources } from '@/lib/api'

export default async function SourcesPage() {
  const data = await getSources()
  // ソース一覧をテーブルまたはカードで表示
  // 各ソースの name, rss_url, category, is_active を表示
}
```

#### 6.1.2 TypeScript 型追加 — `frontend/src/lib/types.ts`

```typescript
export interface SourceResponse {
  id: string
  name: string | null
  rss_url: string
  site_url: string | null
  category: string | null
  is_active: boolean
  created_at: string
}

export interface SourceListResponse {
  items: SourceResponse[]
  total: number
  page: number
  per_page: number
}
```

#### 6.1.3 API クライアント追加 — `frontend/src/lib/api.ts`

```typescript
export async function getSources(): Promise<SourceListResponse> {
  const res = await fetch(`${API_BASE}/sources?active_only=true`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Sources API error: ${res.status}`)
  return res.json()
}
```

### 6.2 カテゴリフィルタ UI

記事一覧ページにカテゴリフィルタ UI を追加する。

#### 6.2.1 方針

- カテゴリ一覧は記事データから動的に取得（専用 API は作らない）
- URL クエリパラメータ `?category=ai` でフィルタ状態を管理
- サーバーサイドでフィルタリング（Client Component の状態管理ではなく、URL ベース）

#### 6.2.2 新規コンポーネント — `frontend/src/components/CategoryFilter.tsx`

```typescript
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface CategoryFilterProps {
  categories: string[]
}

export default function CategoryFilter({ categories }: CategoryFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('category')

  function handleSelect(category: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (category) {
      params.set('category', category)
    } else {
      params.delete('category')
    }
    router.push(`/articles?${params.toString()}`)
  }

  return (
    <nav aria-label="カテゴリフィルタ" role="navigation">
      <ul className="flex flex-wrap gap-2">
        <li>
          <button
            onClick={() => handleSelect(null)}
            aria-pressed={!current}
            className={/* active/inactive styles */}
          >
            すべて
          </button>
        </li>
        {categories.map((cat) => (
          <li key={cat}>
            <button
              onClick={() => handleSelect(cat)}
              aria-pressed={current === cat}
              className={/* active/inactive styles */}
            >
              {cat}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

#### 6.2.3 記事一覧ページ変更 — `frontend/src/app/articles/page.tsx`

```typescript
import { getArticles, getCategories } from '@/lib/api'
import ArticleListLive from '@/components/ArticleListLive'
import CategoryFilter from '@/components/CategoryFilter'

// Next.js 15+ で params/searchParams は Promise 型に変更された。
// 出典: https://nextjs.org/docs/app/api-reference/file-conventions/page
// "v15.0.0-RC: params and searchParams are now promises."
interface Props {
  searchParams: Promise<{ category?: string }>
}

export default async function ArticlesPage({ searchParams }: Props) {
  const params = await searchParams
  const category = params.category

  let data
  try {
    data = await getArticles(1, category)
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">記事一覧</h1>
        <p className="text-gray-500">記事を取得できませんでした。</p>
      </div>
    )
  }

  // カテゴリ一覧: カテゴリフィルタ時もすべてのカテゴリを表示するため、
  // フィルタなしの全記事からユニークカテゴリを取得
  const categories = await getCategories()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">記事一覧</h1>
      <CategoryFilter categories={categories} />
      {/* key={category} でカテゴリ変更時にリマウント → state リセット */}
      <ArticleListLive
        key={category || 'all'}
        initialArticles={data.items}
        total={data.total}
        initialPage={1}
        perPage={20}
        category={category}
      />
    </div>
  )
}
```

#### 6.2.4 API クライアント変更 — `frontend/src/lib/api.ts`

`getArticles` に `category` パラメータを追加し、`getCategories` ユーティリティを追加:

```typescript
export async function getArticles(
  page: number = 1,
  category?: string,
): Promise<ArticleListResponse> {
  const params = new URLSearchParams({ page: String(page) })
  if (category) params.set('category', category)
  const res = await fetch(`${API_BASE}/articles?${params}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

/**
 * ユニークなカテゴリ名の一覧を取得する。
 * 専用 API エンドポイントは設けず、記事一覧（ページ1、per_page=20）の
 * categories フィールドから重複除去して返す。
 * 最新20件のカテゴリで十分な網羅性がある前提。
 * Phase 3 で記事数増大時に専用 GET /categories API を検討する。
 */
export async function getCategories(): Promise<string[]> {
  const data = await getArticles(1)
  const categories = new Set<string>()
  for (const item of data.items) {
    if (item.categories) {
      for (const cat of item.categories) {
        categories.add(cat)
      }
    }
  }
  return Array.from(categories).sort()
}
```

> **v3.1 修正**: `extractUniqueCategories` はインラインではなく `api.ts` の `getCategories()` として定義。カテゴリフィルタ適用中でもすべてのカテゴリを表示するため、フィルタなしの全記事から取得する。

### 6.3 RSS リンク

`layout.tsx` の `<head>` に RSS フィードのリンクを追加:

```typescript
export const metadata: Metadata = {
  title: 'Tech News Curator',
  // ... 既存メタデータ
  alternates: {
    types: {
      'application/rss+xml': '/api/feed/rss',
    },
  },
}
```

### 6.4 ヘッダーナビゲーション変更

`Header.tsx` に「ソース」リンクを追加:

```typescript
// 既存: /articles, /digest
// 追加: /sources
<Link href="/sources">ソース</Link>
```

### 6.5 SSE 接続 URL の統一（v3.1 追加）

#### 6.5.1 現状の問題

現在の `ArticleListLive` は SSE 接続先を `NEXT_PUBLIC_SSE_URL` で制御している:

| 環境 | `NEXT_PUBLIC_SSE_URL` | SSE 接続先 | 問題 |
|------|----------------------|-----------|------|
| 開発 | `http://localhost:8100` | `http://localhost:8100/articles/stream` | CORS 必要、CSP `connect-src 'self'` でブロック |
| 本番 | （未設定、空文字列） | `/articles/stream` | Next.js にルーティングされ 404。`/api/` prefix が必要 |

#### 6.5.2 修正方針

SSE も無限スクロールと同様に **Next.js rewrite（`/api/:path*`）経由** で接続する。これにより:
1. CORS が不要になる（同一オリジン）
2. CSP の `connect-src 'self'` で許可される
3. 環境変数 `NEXT_PUBLIC_SSE_URL` が不要になる

#### 6.5.3 `ArticleListLive.tsx` の変更

```typescript
// 変更前
const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || ''
const es = new EventSource(`${sseUrl}/articles/stream`)

// 変更後（rewrite 経由で同一オリジン）
const es = new EventSource('/api/articles/stream')
```

#### 6.5.4 `docker-compose.dev.yml` の変更

`NEXT_PUBLIC_SSE_URL` 環境変数を削除:

```yaml
services:
  news-frontend:
    environment:
      API_URL: http://news-api:8100
      # NEXT_PUBLIC_SSE_URL は削除（rewrite 経由に統一）
```

#### 6.5.5 Next.js rewrite の SSE 対応確認

Next.js の `rewrites()` は HTTP リクエストをプロキシするため、SSE（`Transfer-Encoding: chunked` の長時間接続）も正常に中継される。Next.js の内部 HTTP プロキシは `node:http` ベースで、ストリーミングレスポンスをそのまま転送する。

> **根拠**: Next.js の rewrites は HTTP reverse proxy として動作し、SSE のストリーミングレスポンスを透過的に中継する。`output: 'standalone'` モードでも同様。

---

## 7. フロントエンド CSP 設計

### 7.1 方針

REQUIREMENTS-v2.0.md §6.8 に基づき、`next.config.ts` の `headers()` で CSP ヘッダーを設定する（nonce 不使用、詳細は §7.2）。

> **出典**: [Next.js Content Security Policy Guide](https://nextjs.org/docs/app/guides/content-security-policy) (v16.1.6, 2026-02-11 更新)

### 7.2 重要な設計判断 — SRI vs Nonce

| 方式 | メリット | デメリット |
|------|---------|----------|
| **Nonce ベース** | 動的スクリプト対応、厳格な CSP | 全ページ動的レンダリング必須、CDN キャッシュ不可 |
| **SRI ベース** | 静的生成可能、CDN キャッシュ可能 | experimental（webpack のみ）、動的スクリプト非対応 |
| **CSP without nonce** | 静的生成可能、設定が簡単 | `unsafe-inline` が必要 |

**選択**: **CSP without nonce**（`next.config.ts` の `headers()` で設定）

**理由**:
1. 本プロジェクトは外部 JavaScript（GTM、Analytics 等）を使用しない
2. インラインスクリプトは Next.js が生成するもののみで、`unsafe-inline` のリスクは限定的
3. 静的生成（`output: 'standalone'`）とのパフォーマンス両立を優先
4. SRI は experimental であり、webpack のみ対応で Turbopack 非対応のため将来移行時にリスク

Phase 3 で外部スクリプト導入時に nonce ベースへの移行を検討する。

### 7.3 実装 — `frontend/next.config.ts`

```typescript
import type { NextConfig } from 'next'

const API_URL = process.env.API_URL || 'http://news-api:8100'
const isDev = process.env.NODE_ENV === 'development'

// CSP ディレクティブ構成
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  // SSE は /api/articles/stream 経由（rewrite）で同一オリジン
  // 開発時は ws: を追加（Next.js HMR WebSocket 用）
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
// upgrade-insecure-requests は本番のみ
// 開発環境（http://localhost）では HTTP→HTTPS 強制アップグレードにより
// API/画像取得が失敗するため除外する
if (!isDev) {
  cspDirectives.push('upgrade-insecure-requests')
}
const cspHeader = cspDirectives.join('; ')

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ]
  },
  async headers() {
    // セキュリティヘッダー（全ページ共通）
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ]

    return [
      {
        // RSS フィードは XML コンテンツのため CSP 不要。
        // CSP を付与すると RSS リーダーが誤動作する可能性がある。
        source: '/api/feed/:path*',
        headers: securityHeaders,
      },
      {
        // RSS 以外の全ページに CSP + セキュリティヘッダーを付与
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          ...securityHeaders,
        ],
      },
    ]
  },
}

export default nextConfig
```

**CSP ディレクティブの根拠**:

| ディレクティブ | 値 | 理由 |
|--------------|-----|------|
| `default-src` | `'self'` | 同一オリジンのみ許可 |
| `script-src` | `'self' 'unsafe-inline'` | Next.js が生成するインラインスクリプト許可。開発時のみ `'unsafe-eval'` 追加（React デバッグ用） |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind CSS のインラインスタイル許可 |
| `img-src` | `'self' blob: data: https:` | 外部 OG 画像（HTTPS のみ）を許可 |
| `connect-src` | `'self'` | SSE 接続は `/api/articles/stream`（rewrite 経由、同一オリジン）。開発時は `ws:` 追加（HMR 用） |
| `object-src` | `'none'` | Flash/Java プラグイン禁止 |
| `frame-ancestors` | `'none'` | iframe 埋め込み禁止（クリックジャッキング防止） |
| `upgrade-insecure-requests` | 本番のみ | HTTP リクエストを HTTPS にアップグレード。**開発環境では除外**（`http://localhost` でサブリクエストが HTTPS に強制変換され、API・画像取得が失敗するため） |

> **出典**: [OWASP HTTP Headers Cheat Sheet — CSP](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html#content-security-policy)
>
> **v3.1 修正**: `upgrade-insecure-requests` を `isDev` 条件で除外。`connect-src` の根拠に SSE の `/api/` prefix 経由接続を明記。

---

## 8. PostgreSQL SSL/TLS 設計

### 8.1 方針

REQUIREMENTS-v2.0.md §6.7 に基づき、PostgreSQL の接続を SSL/TLS で暗号化する。

> **出典**: [PostgreSQL 16 SSL/TLS](https://www.postgresql.org/docs/16/ssl-tcp.html)

### 8.2 証明書生成

自己署名証明書を使用する。本番環境では Let's Encrypt や内部 CA の証明書に置き換える。

#### 8.2.1 証明書生成スクリプト — `db/ssl/generate-certs.sh`（新規）

```bash
#!/bin/bash
set -euo pipefail

# Output directory
SSL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Generate CA key and certificate
openssl genrsa -out "$SSL_DIR/ca.key" 4096
openssl req -new -x509 -days 3650 -key "$SSL_DIR/ca.key" \
    -out "$SSL_DIR/ca.crt" -subj "/CN=news-curator-ca"

# Generate server key and CSR
openssl genrsa -out "$SSL_DIR/server.key" 2048
openssl req -new -key "$SSL_DIR/server.key" \
    -out "$SSL_DIR/server.csr" -subj "/CN=news-db"

# Sign server certificate with CA
openssl x509 -req -days 3650 -in "$SSL_DIR/server.csr" \
    -CA "$SSL_DIR/ca.crt" -CAkey "$SSL_DIR/ca.key" -CAcreateserial \
    -out "$SSL_DIR/server.crt"

# Set ownership to postgres user (UID 999) inside container
# PostgreSQL rejects server.key if the running user cannot read it.
# With 0600, only UID 999 (postgres) can read the file.
chown 999:999 "$SSL_DIR/server.key" "$SSL_DIR/server.crt" "$SSL_DIR/ca.crt"
chmod 600 "$SSL_DIR/server.key"
chmod 644 "$SSL_DIR/server.crt" "$SSL_DIR/ca.crt"

# Clean up CSR
rm -f "$SSL_DIR/server.csr" "$SSL_DIR/ca.srl"

echo "SSL certificates generated in $SSL_DIR (owner: 999:999 for Docker postgres user)"
```

#### 8.2.2 .gitignore 追加

```
db/ssl/*.key
db/ssl/*.crt
db/ssl/*.csr
db/ssl/*.srl
```

### 8.3 Docker Compose 変更 — `docker-compose.yml`

```yaml
services:
  news-db:
    image: postgres:16.11
    command:
      - "postgres"
      - "-c"
      - "ssl=on"
      - "-c"
      - "ssl_cert_file=/var/lib/postgresql/ssl/server.crt"
      - "-c"
      - "ssl_key_file=/var/lib/postgresql/ssl/server.key"
      - "-c"
      - "ssl_ca_file=/var/lib/postgresql/ssl/ca.crt"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
      - ./db/ssl/server.crt:/var/lib/postgresql/ssl/server.crt:ro
      - ./db/ssl/server.key:/var/lib/postgresql/ssl/server.key:ro
      - ./db/ssl/ca.crt:/var/lib/postgresql/ssl/ca.crt:ro
    # ... 他の設定は変更なし

  news-api:
    environment:
      DATABASE_URL: postgresql+asyncpg://news_app:${NEWS_APP_PASSWORD}@news-db:5432/news_curator?ssl=require
      DATABASE_ADMIN_URL: postgresql+asyncpg://news:${POSTGRES_PASSWORD}@news-db:5432/news_curator?ssl=require
```

### 8.4 Docker Compose 開発用 — `docker-compose.dev.yml`

開発環境では SSL を無効化する（開発利便性のため）:

```yaml
services:
  news-db:
    command: []  # デフォルトの postgres コマンド（SSL なし）
  news-api:
    environment:
      DATABASE_URL: postgresql+asyncpg://news:${POSTGRES_PASSWORD:-devpassword}@news-db:5432/news_curator
      # SSL パラメータなし
```

### 8.5 証明書ファイルパーミッション

PostgreSQL は `server.key` のパーミッションが `0600` でないと起動を拒否する。Docker ボリュームマウントでは UID/GID が重要。

**対応**: `docker-compose.yml` で証明書ファイルを `:ro`（読み取り専用）でマウントし、PostgreSQL コンテナ内の `postgres` ユーザー（UID 999）がファイルを読める必要がある。

```yaml
# db/ssl ディレクトリ内のファイルパーミッション
# generate-certs.sh が chown 999:999 を実行するため、
# ホスト上で sudo 権限、またはスクリプトを root で実行する必要がある。
# server.key: 0600 (owner: 999:999) — 必須。root:root だと postgres ユーザーが読めず起動失敗
# server.crt: 0644 (owner: 999:999)
# ca.crt:     0644 (owner: 999:999)
```

> **根拠**: PostgreSQL は `server.key` のパーミッションが `0600` より緩い場合に起動を拒否する（[PostgreSQL 16 SSL/TLS](https://www.postgresql.org/docs/16/ssl-tcp.html)）。Docker コンテナ内の `postgres` ユーザーは UID 999 で実行されるため、`0600` かつ `owner: root` ではファイルを読み取れず起動に失敗する。`owner: 999:999` に統一する。

### 8.6 テスト環境

テスト環境（testcontainers）では SSL を使用しない。testcontainers の PostgreSQL コンテナはデフォルトで SSL なしで起動し、テスト用接続 URL にも SSL パラメータは含めない。変更不要。

---

## 9. OWASP ZAP DAST 設計

### 9.1 方針

REQUIREMENTS-v2.0.md §8.4 に基づき、リリース前に OWASP ZAP の API スキャンを実行する。CI/CD には組み込まず、**手動実行のリリース前チェック**として位置づける。

> **出典**: [ZAP API Scan — Docker](https://www.zaproxy.org/docs/docker/api-scan/), [OWASP ZAP Docker Documentation](https://www.zaproxy.org/docs/docker/)

### 9.2 実行方法

#### 9.2.1 OpenAPI スキーマの利用

FastAPI は `/openapi.json` で OpenAPI 3.0 スキーマを自動生成する。ZAP API スキャンはこのスキーマを入力として使用する。

```bash
# 開発環境で API を起動
make dev

# ZAP API スキャンを実行
docker run --rm --network host \
    -v $(pwd)/zap-reports:/zap/wrk:rw \
    ghcr.io/zaproxy/zaproxy:stable \
    zap-api-scan.py \
    -t http://localhost:8100/openapi.json \
    -f openapi \
    -r report.html \
    -J report.json \
    -c zap-config.conf
```

#### 9.2.2 ZAP 設定ファイル — `zap-config.conf`（新規）

```conf
# ZAP API Scan Configuration
# FAIL: items that will cause the scan to fail
# WARN: items that will be flagged but not fail
# IGNORE: items that will be silently ignored

# API Key authentication header
replacer.full_list(0).description=API Key
replacer.full_list(0).enabled=true
replacer.full_list(0).matchtype=REQ_HEADER
replacer.full_list(0).matchstr=X-API-Key
replacer.full_list(0).regex=false
replacer.full_list(0).replacement=${ZAP_API_KEY}

# Known false positives for API-only application
10020	IGNORE	# X-Frame-Options (handled by API middleware)
10021	IGNORE	# X-Content-Type-Options (handled by API middleware)
```

#### 9.2.3 Makefile ターゲット

```makefile
## ZAP_API_KEY: ZAP 認証用の単一キー。
## API_KEYS（カンマ区切り複数キー）とは別に、.env で単一値を定義する。
## 例: ZAP_API_KEY=your-single-zap-key
zap-scan:
	mkdir -p zap-reports
	docker run --rm --network host \
		-v $(pwd)/zap-reports:/zap/wrk:rw \
		-e ZAP_API_KEY=$(ZAP_API_KEY) \
		ghcr.io/zaproxy/zaproxy:stable \
		zap-api-scan.py \
		-t http://localhost:8100/openapi.json \
		-f openapi \
		-r report.html \
		-J report.json \
		-z "-config replacer.full_list(0).description=AuthHeader \
		    -config replacer.full_list(0).enabled=true \
		    -config replacer.full_list(0).matchtype=REQ_HEADER \
		    -config replacer.full_list(0).matchstr=X-API-Key \
		    -config replacer.full_list(0).replacement=$(ZAP_API_KEY)"
```

### 9.3 実行タイミング

| タイミング | 方法 | 頻度 |
|-----------|------|------|
| リリース前 | `make zap-scan` 手動実行 | 各リリース前 |
| Phase 3 | CI/CD に統合 | PR 毎（予定） |

### 9.4 レポート出力

| ファイル | フォーマット | 用途 |
|---------|------------|------|
| `zap-reports/report.html` | HTML | ブラウザで確認 |
| `zap-reports/report.json` | JSON | 自動解析・CI 統合用 |

`.gitignore` に追加:
```
zap-reports/
```

---

## 10. Playwright E2E テスト設計

### 10.1 方針

REQUIREMENTS-v2.0.md §8.1 に基づき、フロントエンドの E2E テストを Playwright で実装する。async Server Components のテストに必須。

> **出典**: [Next.js Testing: Playwright](https://nextjs.org/docs/app/guides/testing/playwright) (v16.1.6, 2026-02-11 更新)

### 10.2 セットアップ

#### 10.2.1 インストール

```bash
cd frontend
npm init playwright
# - TypeScript: Yes
# - Test directory: e2e
# - GitHub Actions: Yes
# - Browsers: Yes (install all)
```

#### 10.2.2 package.json 変更

```json
{
  "devDependencies": {
    "@playwright/test": "^1.50.0"
  },
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

#### 10.2.3 Playwright 設定 — `frontend/playwright.config.ts`（新規）

```typescript
import { defineConfig, devices } from '@playwright/test'

// Next.js のデフォルトポート（standalone モードは port 3000）
const PORT = 3000
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      API_URL: 'http://localhost:8100',
    },
  },
})
```

> **v3.1 修正**: `baseURL` と `webServer.url` を同一の `BASE_URL` 定数（`http://localhost:3000`）に統一。Next.js の `npm run start` はデフォルトで port 3000 を使用する。Docker Compose の port 3100 はホストマッピング（`3100:3000`）であり、Playwright はホスト上で Next.js を直接起動するため port 3000 を使用する。

### 10.3 テストデータ準備（v3.1 追加）

E2E テストは記事・ダイジェスト・ソースの存在を前提とする。テストデータは API 経由で投入する。

#### 10.3.1 方式: globalSetup で API 経由シード

```typescript
// frontend/e2e/global-setup.ts
import { request } from '@playwright/test'

const API_URL = 'http://localhost:8100'
const API_KEY = process.env.TEST_API_KEY || 'test-key-for-testing'

async function globalSetup() {
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { 'X-API-Key': API_KEY },
  })

  // テスト用記事を投入
  const articles = [
    {
      source_url: 'https://example.com/article-1',
      source_name: 'TechCrunch',
      title_original: 'Test Article 1',
      title_ja: 'テスト記事 1',
      summary_ja: 'テスト記事1の要約です。',
      categories: ['ai', 'startup'],
      published_at: new Date().toISOString(),
    },
    {
      source_url: 'https://example.com/article-2',
      source_name: 'The Verge',
      title_original: 'Test Article 2',
      title_ja: 'テスト記事 2',
      summary_ja: 'テスト記事2の要約です。',
      categories: ['hardware'],
      og_image_url: 'https://via.placeholder.com/800x400',
      published_at: new Date().toISOString(),
    },
  ]
  for (const article of articles) {
    await api.post('/articles', { data: article })
  }

  // テスト用ダイジェストを投入
  await api.post('/digest', {
    data: {
      digest_date: new Date().toISOString().split('T')[0],
      title: 'テストダイジェスト',
      content: 'テストダイジェストの内容です。',
      article_count: articles.length,
    },
  })

  // テスト用ソースを投入
  await api.post('/sources', {
    data: {
      name: 'TechCrunch',
      rss_url: 'https://techcrunch.com/feed/',
      site_url: 'https://techcrunch.com',
      category: 'general',
    },
  })

  await api.dispose()
}

export default globalSetup
```

#### 10.3.2 CI 環境での前提条件

CI では API サーバーが `globalSetup` 実行前に起動済みである必要がある。§10.4 の CI ワークフローで API 起動後にヘルスチェックを行い、API が応答可能な状態で Playwright テストを開始する:

```yaml
      - name: Wait for API server
        run: |
          for i in $(seq 1 30); do
            curl -s http://localhost:8100/health && break
            sleep 1
          done
```

**設計判断**:

| 判断 | 理由 |
|------|------|
| SQL シードではなく API 経由 | API のバリデーション・ビジネスロジックを経由することで、データ整合性を保証。SQL 直接投入はスキーマ変更時に壊れやすい |
| `globalSetup` で 1 回のみ投入 | テスト間でデータを共有。E2E テストは読み取り中心で相互干渉が少ない |
| テストデータの冪等性 | 記事の `source_url` UNIQUE 制約により、再実行時は 409 エラーとなるが globalSetup はエラーを無視して続行 |

### 10.4 テストケース

#### 10.4.1 E2E テストファイル構成

```
frontend/e2e/
├── home.spec.ts           # ホームページ表示テスト
├── articles.spec.ts       # 記事一覧・詳細テスト
├── digest.spec.ts         # ダイジェスト一覧・詳細テスト
├── sources.spec.ts        # ソース一覧テスト
├── navigation.spec.ts     # ナビゲーション・リンクテスト
└── accessibility.spec.ts  # アクセシビリティテスト
```

#### 10.4.2 テストケース一覧

| ファイル | テストケース | 説明 |
|---------|------------|------|
| `home.spec.ts` | `should display latest articles` | ホームページに記事が表示される |
| `home.spec.ts` | `should display hero section` | ヒーローセクションが表示される |
| `articles.spec.ts` | `should list articles` | 記事一覧ページが表示される |
| `articles.spec.ts` | `should navigate to article detail` | 記事カードクリックで詳細ページに遷移 |
| `articles.spec.ts` | `should display article detail` | 記事詳細ページにタイトル・要約・メタデータが表示される |
| `articles.spec.ts` | `should filter by category` | カテゴリフィルタで記事がフィルタリングされる |
| `articles.spec.ts` | `should handle 404 for invalid article` | 存在しない記事 ID で 404 ページ表示 |
| `digest.spec.ts` | `should list digests` | ダイジェスト一覧が表示される |
| `digest.spec.ts` | `should display digest detail` | ダイジェスト詳細が表示される |
| `sources.spec.ts` | `should list sources` | ソース一覧が表示される |
| `navigation.spec.ts` | `should navigate between pages` | ヘッダーリンクで各ページに遷移可能 |
| `navigation.spec.ts` | `should display 404 page` | 存在しない URL で 404 ページ表示 |
| `accessibility.spec.ts` | `should have proper heading hierarchy` | 見出し階層が適切（h1 → h2 → h3） |
| `accessibility.spec.ts` | `should have proper aria labels` | ナビゲーション・ボタンに aria-label が設定 |

### 10.5 CI 統合

`.github/workflows/ci.yml` に Playwright テストジョブを追加:

```yaml
  frontend-e2e:
    name: Frontend E2E Tests
    runs-on: ubuntu-latest
    needs: [api-test]  # API テストが成功した後に実行

    services:
      postgres:
        image: postgres:16.11
        env:
          POSTGRES_USER: news
          POSTGRES_PASSWORD: testpassword
          POSTGRES_DB: news_curator
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Start API server
        working-directory: api
        run: |
          pip install -r requirements.txt
          alembic upgrade head
          uvicorn app.main:app --host 0.0.0.0 --port 8100 &
        env:
          DATABASE_URL: postgresql+asyncpg://news:testpassword@localhost:5432/news_curator
          ENVIRONMENT: development
          API_KEYS: test-key-for-testing

      - name: Wait for API server
        run: |
          for i in $(seq 1 30); do
            curl -sf http://localhost:8100/health && break
            sleep 1
          done

      - name: Set up Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Install Playwright Browsers
        working-directory: frontend
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        working-directory: frontend
        run: npx playwright test
        env:
          API_URL: http://localhost:8100
          TEST_API_KEY: test-key-for-testing

      - name: Upload Playwright Report
        uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 30
```

### 10.6 Makefile ターゲット

```makefile
test-e2e:
	cd frontend && npx playwright test

test-e2e-ui:
	cd frontend && npx playwright test --ui
```

---

## 11. インフラ変更まとめ

### 11.1 ファイル変更一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `api/requirements.txt` | 変更 | `feedgen==1.0.0` 追加 |
| `api/app/config.py` | 変更 | `public_url` フィールド追加 |
| `api/app/main.py` | 変更 | sources, feed ルーター登録。CORS methods 拡張。バージョン `2.0.0` |
| `api/app/middleware.py` | 変更 | `/feed/rss` を CSP スキップ対象に追加 |
| `api/app/schemas/source.py` | 新規 | SourceCreate, SourceUpdate, SourceResponse, SourceListResponse |
| `api/app/services/source_service.py` | 新規 | ソース CRUD サービス |
| `api/app/services/rss_service.py` | 新規 | RSS フィード生成サービス |
| `api/app/routers/sources.py` | 新規 | ソース管理ルーター |
| `api/app/routers/feed.py` | 新規 | RSS フィードルーター |
| `api/app/routers/articles.py` | 変更 | `category` クエリパラメータ追加 |
| `api/app/services/article_service.py` | 変更 | `category_filter` パラメータ追加 |
| `api/tests/test_sources.py` | 新規 | ソース管理テスト（12 テスト） |
| `api/tests/test_source_service.py` | 新規 | ソースサービステスト（7 テスト） |
| `api/tests/test_feed.py` | 新規 | RSS フィードテスト（5 テスト） |
| `api/tests/test_rss_service.py` | 新規 | RSS サービステスト（3 テスト） |
| `api/tests/test_articles.py` | 変更 | カテゴリフィルタテスト追加（3 テスト） |
| `api/tests/test_article_service.py` | 変更 | カテゴリフィルタサービステスト追加（2 テスト） |
| `docker-compose.yml` | 変更 | PostgreSQL SSL |
| `docker-compose.dev.yml` | 変更 | SSL 無効化、`NEXT_PUBLIC_SSE_URL` 削除 |
| `frontend/Dockerfile` | 変更 | Node.js 22.x ベースイメージ |
| `frontend/package.json` | 変更 | `@playwright/test` 追加、テストスクリプト追加 |
| `frontend/next.config.ts` | 変更 | CSP ヘッダー追加 |
| `frontend/playwright.config.ts` | 新規 | Playwright 設定 |
| `frontend/e2e/global-setup.ts` | 新規 | E2E テストデータ投入 |
| `frontend/e2e/*.spec.ts` | 新規 | E2E テスト（14 テスト） |
| `frontend/src/app/sources/page.tsx` | 新規 | ソース一覧ページ |
| `frontend/src/app/articles/page.tsx` | 変更 | カテゴリフィルタ・`searchParams` 対応 |
| `frontend/src/components/CategoryFilter.tsx` | 新規 | カテゴリフィルタコンポーネント |
| `frontend/src/components/ArticleListLive.tsx` | 変更 | `category` prop 追加、SSE URL を `/api/` prefix に統一、SSE 新着のカテゴリフィルタ |
| `frontend/src/lib/api.ts` | 変更 | `getSources`, `getArticles` にカテゴリ対応、`getCategories` 追加 |
| `frontend/src/lib/types.ts` | 変更 | SourceResponse, SourceListResponse 追加 |
| `frontend/src/components/Header.tsx` | 変更 | ソースリンク追加 |
| `frontend/src/app/layout.tsx` | 変更 | RSS alternate link 追加 |
| `db/ssl/generate-certs.sh` | 新規 | SSL 証明書生成スクリプト |
| `zap-config.conf` | 新規 | ZAP スキャン設定 |
| `Makefile` | 変更 | `zap-scan`, `test-e2e`, `test-e2e-ui` ターゲット追加 |
| `.env.example` | 変更 | `PUBLIC_URL` 追加 |
| `.gitignore` | 変更 | `db/ssl/`, `zap-reports/`, `playwright-report/` 追加 |
| `.github/workflows/ci.yml` | 変更 | Playwright E2E テストジョブ追加、Node.js 22 |

### 11.2 マイグレーション

Phase 2 では**データベーススキーマの変更はない**。`sources` テーブルは Phase 1.0 の初期マイグレーション (`d4be925c915c`) で作成済み。`articles.categories` カラムも作成済み。

新規 Alembic マイグレーションは不要。

### 11.3 API バージョン

`api/app/main.py`:
```python
app = FastAPI(
    title="Tech News Curator API",
    version="2.0.0",  # 1.2.0 → 2.0.0
    # ...
)
```

`api/pyproject.toml`:
```toml
[project]
version = "2.0.0"
```

---

## 12. 実装順序

依存関係を考慮した実装順序:

| ステップ | 内容 | 依存 | 見積テスト数 |
|---------|------|------|------------|
| 1 | ソース管理 API（スキーマ → サービス → ルーター → テスト） | なし | 19 |
| 2 | カテゴリフィルタ（サービス変更 → ルーター変更 → テスト） | なし | 5 |
| 3 | RSS 配信（Settings → サービス → ルーター → テスト） | なし | 8 |
| 4 | main.py 統合（ルーター登録、CORS、バージョン） | Step 1-3 |  |
| 5 | Docker イメージ更新（Node.js 22.x） | なし | — |
| 6 | PostgreSQL SSL/TLS（証明書生成 → Docker Compose 変更） | Step 5 | — |
| 7 | SSE 接続 URL 統一（`/api/articles/stream` 経由） | なし | — |
| 8 | フロントエンド CSP（next.config.ts） | Step 7 | — |
| 9 | フロントエンド拡張（ソース一覧、カテゴリフィルタ UI、RSS リンク、ArticleListLive category 対応） | Step 1-3, 7 | — |
| 10 | Playwright E2E テスト（セットアップ → globalSetup → テスト作成 → CI 統合） | Step 9 | 14 |
| 11 | OWASP ZAP 設定（config → Makefile） | Step 4 | — |
| **合計** | | | **46 テスト** |

---

## 13. テスト全体サマリ

### 13.1 Phase 2 新規テスト

| テスト種別 | ファイル | テスト数 |
|-----------|---------|---------|
| 統合テスト | `test_sources.py` | 12 |
| 単体テスト | `test_source_service.py` | 7 |
| 統合テスト | `test_feed.py` | 5 |
| 単体テスト | `test_rss_service.py` | 3 |
| 統合テスト | `test_articles.py`（追加分） | 3 |
| 単体テスト | `test_article_service.py`（追加分） | 2 |
| E2E テスト | `e2e/*.spec.ts` | 14 |
| **合計** | | **46** |

### 13.2 Phase 2 後の全テスト数（累計）

| テスト種別 | Phase 1.2 | Phase 2 追加 | 合計 |
|-----------|-----------|------------|------|
| API 統合テスト | 38 | 20 | 58 |
| サービス単体テスト | 16 | 12 | 28 |
| フロントエンド E2E | 0 | 14 | 14 |
| **合計** | **54** | **46** | **100** |

---

## 14. 参考文献

### 新規参照

| 文書 | URL |
|------|-----|
| feedgen 1.0.0 PyPI | https://pypi.org/project/feedgen/ |
| feedgen API Documentation | https://feedgen.kiesow.be/api.html |
| Next.js CSP Guide (v16.1.6) | https://nextjs.org/docs/app/guides/content-security-policy |
| Next.js Playwright Testing (v16.1.6) | https://nextjs.org/docs/app/guides/testing/playwright |
| Playwright Documentation | https://playwright.dev/docs/intro |
| OWASP ZAP API Scan — Docker | https://www.zaproxy.org/docs/docker/api-scan/ |
| OWASP ZAP Docker Documentation | https://www.zaproxy.org/docs/docker/ |
| PostgreSQL 16 SSL/TLS | https://www.postgresql.org/docs/16/ssl-tcp.html |
| SQLAlchemy ARRAY Comparator | https://docs.sqlalchemy.org/en/20/core/type_api.html#sqlalchemy.types.ARRAY.Comparator.any |
| Node.js Release Schedule | https://nodejs.org/en/about/previous-releases |

### Phase 1.2 から継続参照

| 文書 | URL |
|------|-----|
| OWASP API Security Top 10 (2023) | https://owasp.org/API-Security/editions/2023/en/0x11-t10/ |
| OWASP HTTP Headers Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html |
| FastAPI Security Reference | https://fastapi.tiangolo.com/reference/security/ |
| Pydantic v2 Fields | https://docs.pydantic.dev/latest/concepts/fields/ |
| Pydantic v2 ConfigDict | https://docs.pydantic.dev/latest/api/config/ |
