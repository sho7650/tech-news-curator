# 設計書: GitHub 公開前セキュリティ・品質修正 (v1.0)

## 概要

分析レポートで検出された CRITICAL 3件、HIGH 4件、MEDIUM 3件の問題を修正し、GitHub 公開可能な状態にする。
各修正は公式ドキュメントに基づいて設計している。

| 優先度 | 件数 | 内容 |
|--------|------|------|
| CRITICAL | 3件 | ハードコードされた認証情報、内部インフラURL露出 |
| HIGH | 4件 | SSRF、XSS、Docker root実行、ページネーション未実装 |
| MEDIUM | 3件 | CORS未設定、画像ドメイン制限、日付パースエラー |

---

## CRITICAL

### 修正 #1: config.py ハードコードパスワード削除

**根拠**: デフォルト値 `"...news:password@..."` が公開リポジトリに含まれる

**対象ファイル**:
- `api/app/config.py`
- `api/app/main.py`

**設計**:
- デフォルト値を `"postgresql+asyncpg://news:CHANGEME@localhost:5432/news_curator"` に変更
- `validate_production()` メソッドを追加し、production 環境で CHANGEME が残っていたらエラー
- デフォルト値を完全に消すと `database.py` L13 の `settings = Settings()` がモジュールインポート時に失敗し、テストが壊れるため残す

**変更内容**:

```python
# api/app/config.py
class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str = "postgresql+asyncpg://news:CHANGEME@localhost:5432/news_curator"
    environment: str = "development"

    def validate_production(self) -> None:
        if self.environment == "production" and "CHANGEME" in self.database_url:
            raise ValueError(
                "DATABASE_URL contains placeholder credentials. "
                "Set DATABASE_URL environment variable for production."
            )
```

```python
# api/app/main.py — lifespan 内で呼び出し
@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import settings
    settings.validate_production()
    yield
    await async_engine.dispose()
```

**テスト影響**: なし（テストは development モードで実行）

---

### 修正 #2: docker-compose.dev.yml 環境変数化

**根拠**: `devpassword` がハードコードされている

**対象ファイル**: `docker-compose.dev.yml`

**設計**: Docker Compose の `${VAR:-default}` 構文を使用
- 出典: [Docker Compose Interpolation](https://docs.docker.com/reference/compose-file/interpolation/)
- Compose v1/v2 両方で対応

**変更内容**:

```yaml
services:
  news-api:
    environment:
      DATABASE_URL: postgresql+asyncpg://news:${POSTGRES_PASSWORD:-devpassword}@news-db:5432/news_curator
  news-db:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-devpassword}
```

**テスト影響**: なし

---

### 修正 #3: 内部レジストリURL プレースホルダー化

**根拠**: `registry.oshiire.to` が内部インフラのドメイン名を露出

**対象ファイル (7箇所)**:

| ファイル | 変更内容 |
|----------|----------|
| `docker-compose.yml` | `image: ${REGISTRY:-ghcr.io/your-org}/news-curator/{api,frontend}:latest` |
| `Makefile` | `REGISTRY ?= ghcr.io/your-org` 変数化 |
| `.env.example` | `REGISTRY=<your-registry-url>` 追加 |
| `CLAUDE.md` | `${REGISTRY}/news-curator/...` に変更 |
| `README.md` | `make push` の説明を汎用化 |
| `README.ja.md` | 同上（日本語） |
| `docs/DESIGN.md`, `docs/REQUIREMENTS.md` | `registry.oshiire.to` → `<your-registry>` に全置換 |

---

## HIGH

### 修正 #4: SSRF 対策 — URL バリデーション

**根拠**: `/ingest` の `url: str` が任意文字列を受け付ける（file://, ftp:// 含む）

**公式ドキュメント確認結果**:
- Pydantic v2 の `HttpUrl` は `Url` オブジェクトを返す（`str` ではない）
- `str()` キャストが必要
- http/https スキームのみ許可、file:// や ftp:// をブロック
- 出典: [Pydantic Network Types](https://docs.pydantic.dev/latest/api/networks/)

**対象ファイル**:
- `api/app/schemas/ingest.py`
- `api/app/routers/ingest.py`
- `api/tests/test_ingest.py`

**変更内容**:

```python
# api/app/schemas/ingest.py
from pydantic import HttpUrl

class IngestRequest(AppBaseModel):
    url: HttpUrl
```

```python
# api/app/routers/ingest.py — str() キャスト追加
result = extract_article(str(request.url))
```

```python
# api/tests/test_ingest.py — 不正 URL テスト追加
async def test_ingest_invalid_url(client):
    response = await client.post("/ingest", json={"url": "not-a-url"})
    assert response.status_code == 422
```

**テスト影響**: 既存テストは有効な HTTPS URL を使用しているため影響なし

---

### 修正 #5: XSS — ReactMarkdown 安全性確認

**公式ドキュメント確認結果**:
- react-markdown v10 はデフォルトで raw HTML を**描画しない**（安全）
- HTML を描画するには `rehype-raw` プラグインが明示的に必要
- 出典: [react-markdown README](https://github.com/remarkjs/react-markdown)

**結論**: 現在のコードは安全。コメント追加のみ。

**対象ファイル**: `frontend/src/app/articles/[id]/page.tsx`

**変更内容**: 安全性を明示するコメントを追加

```tsx
{/* react-markdown v10+ はデフォルトで raw HTML を描画しない（rehype-raw 不使用で安全） */}
<ReactMarkdown>{article.summary_ja}</ReactMarkdown>
```

---

### 修正 #6: Docker 非 root ユーザー化

**公式ドキュメント確認結果**:
- `python:3.12-slim`: 非 root ユーザーなし。手動作成が必要
  - 出典: [Docker Python Guide](https://docs.docker.com/guides/python/containerize/)
- `node:20-slim`: `node` ユーザー (UID 1000) が事前作成済み
  - 出典: [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

**対象ファイル**:
- `api/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.dev.yml`

**変更内容**:

```dockerfile
# api/Dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN adduser --disabled-password --gecos "" --no-create-home --uid 10001 appuser
USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
```

```dockerfile
# frontend/Dockerfile — production ステージのみ
FROM node:20-slim AS production
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
```

dev ステージは root のまま（ボリュームマウント互換性のため）。

```yaml
# docker-compose.dev.yml — API の user override 追加
news-api:
    user: "root"
```

---

### 修正 #7: Digest ページネーション追加

**根拠**: `GET /digest` が全件返却。データ増加時にメモリ・パフォーマンス問題。

**設計**: Articles エンドポイントと同じ `page`/`per_page` パターンを踏襲。

**対象ファイル**:
- `api/app/services/digest_service.py`
- `api/app/routers/digest.py`
- `api/app/schemas/digest.py`
- `api/tests/test_digest.py`
- `frontend/src/lib/types.ts`

**変更内容**:

```python
# api/app/services/digest_service.py
async def get_digests(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Digest], int]:
    count_result = await session.execute(select(func.count()).select_from(Digest))
    total = count_result.scalar_one()
    result = await session.execute(
        select(Digest)
        .order_by(Digest.digest_date.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    digests = list(result.scalars().all())
    return digests, total
```

```python
# api/app/routers/digest.py
@router.get("", response_model=DigestListResponse)
async def list_digests(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    digests, total = await get_digests(session, page, per_page)
    return DigestListResponse(items=digests, total=total, page=page, per_page=per_page)
```

```python
# api/app/schemas/digest.py — DigestListResponse に page, per_page 追加
class DigestListResponse(AppBaseModel):
    items: list[DigestListItem]
    total: int
    page: int
    per_page: int
```

---

## MEDIUM

### 修正 #8: CORS ミドルウェア追加

**公式ドキュメント確認結果**:
- Server Components はサーバー側で fetch するためブラウザ CORS は不要
- ただしブラウザからの直接アクセス（Swagger UI 等）に備えて最小限追加
- 出典: [FastAPI CORS Tutorial](https://fastapi.tiangolo.com/tutorial/cors/)

**対象ファイル**: `api/app/main.py`

**変更内容**:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3100", "http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

---

### 修正 #9: Next.js images remotePatterns コメント追加

**根拠**: `hostname: '**'` が意図的かどうか不明

**設計**: OG 画像は様々なドメインから取得するため `**` は妥当。説明コメント追加のみ。

**対象ファイル**: `frontend/next.config.ts`

**変更内容**:

```typescript
images: {
    // og_image_url は様々な外部サイトから取得するため全 HTTPS ドメインを許可
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
},
```

---

### 修正 #10: _parse_date エラーハンドリング

**根拠**: `"2026-13-45"` のような不正日付で 500 エラーが発生する

**対象ファイル**:
- `api/app/routers/articles.py`
- `api/tests/test_articles.py`

**変更内容**:

```python
# api/app/routers/articles.py
def _parse_date(date_str: str) -> date:
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {date_str}")
```

`date.fromisoformat()` は Python 3.7+ で利用可能。`YYYY-MM-DD` フォーマットをネイティブ処理。

```python
# api/tests/test_articles.py — 不正日付テスト追加
async def test_list_articles_invalid_date(client):
    response = await client.get("/articles", params={"date": "2026-13-45"})
    assert response.status_code == 400
```

---

## 変更ファイル一覧（25ファイル）

| # | ファイル | 修正項目 |
|---|----------|----------|
| 1 | `api/app/config.py` | #1 |
| 2 | `api/app/main.py` | #1, #8 |
| 3 | `api/app/schemas/ingest.py` | #4 |
| 4 | `api/app/routers/ingest.py` | #4 |
| 5 | `api/app/routers/articles.py` | #10 |
| 6 | `api/app/routers/digest.py` | #7 |
| 7 | `api/app/services/digest_service.py` | #7 |
| 8 | `api/app/schemas/digest.py` | #7 |
| 9 | `api/Dockerfile` | #6 |
| 10 | `frontend/Dockerfile` | #6 |
| 11 | `frontend/next.config.ts` | #9 |
| 12 | `frontend/src/app/articles/[id]/page.tsx` | #5 |
| 13 | `frontend/src/lib/types.ts` | #7 |
| 14 | `docker-compose.yml` | #3 |
| 15 | `docker-compose.dev.yml` | #2, #6 |
| 16 | `Makefile` | #3 |
| 17 | `.env.example` | #3 |
| 18 | `CLAUDE.md` | #3 |
| 19 | `README.md` | #3 |
| 20 | `README.ja.md` | #3 |
| 21 | `docs/DESIGN.md` | #3 |
| 22 | `docs/REQUIREMENTS.md` | #3 |
| 23 | `api/tests/test_ingest.py` | #4 |
| 24 | `api/tests/test_articles.py` | #10 |
| 25 | `api/tests/test_digest.py` | #7 |

## 追加依存パッケージ

なし（`HttpUrl` は Pydantic 同梱、`CORSMiddleware` は FastAPI/Starlette 同梱）

## 検証方法

1. `make test` — 全テスト（既存17 + 新規3 = 20件）がパス
2. `grep -r "registry.oshiire.to"` — 0件であること
3. `grep -r "news:password@"` — 0件であること
4. `make dev` — Docker 開発環境が正常起動
