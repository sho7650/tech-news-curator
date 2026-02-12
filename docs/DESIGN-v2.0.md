# Phase 1.2 設計書 — セキュリティ強化・品質向上

> **Version**: 2.1
> **Date**: 2026-02-12
> **Base**: REQUIREMENTS-v2.0.md §6–§8, §11 Phase 1.2
> **Status**: レビュー待ち

---

## 変更履歴

| Version | Date | 変更内容 |
|---------|------|----------|
| 1.0 | 2025-02-06 | 初版（Phase 1.0 MVP） |
| 1.1 | 2025-02 | 設計レビュー修正版 |
| 2.0 | 2026-02-11 | Phase 1.2 セキュリティ強化・品質向上 |
| 2.1 | 2026-02-12 | 実装中の不具合に基づく設計修正（§2.2, §3.1.2, §4.1, §4.4, §4.6 修正） |

---

## 1. 概要

Phase 1.2 は、Phase 1.0/1.1 で構築した MVP に対し、以下 3 領域の改善を行う。

1. **セキュリティ強化** — API Key 認証、レート制限、セキュリティヘッダー、入力検証強化、CORS 本番検証、エラーハンドリング改善
2. **インフラ強化** — Docker ネットワーク分離、イメージピン留め、リソース制限、DB 認証・ユーザー分離
3. **品質向上** — サービス層テスト追加、エラーバウンダリ、アクセシビリティ、CI/CD セキュリティスキャン

**設計原則**: 既存のルーター・サービス・スキーマ構造を維持し、横断的関心事（認証・レート制限・ヘッダー）はミドルウェアまたは FastAPI の DI 機構で注入する。ルーターのビジネスロジックへの影響を最小化する。

---

## 2. 技術スタック追加・バージョン確定

### 2.1 新規依存パッケージ

| パッケージ | バージョン | 用途 | 追加先 |
|-----------|-----------|------|--------|
| slowapi | 0.1.9 | レート制限 | `api/requirements.txt` |
| server-only | 0.0.1 | Server Component ガード | `frontend/package.json` |
| bandit | >=1.9.3 | Python SAST | `api/requirements-dev.txt` |
| pip-audit | >=2.10.0 | 依存パッケージ脆弱性スキャン | `api/requirements-dev.txt` |
| semgrep | >=1.150.0 | SAST（FastAPI 対応） | CI パイプラインのみ（ローカルは任意） |

> **根拠**: slowapi 0.1.9 は FastAPI/Starlette 向けレート制限の事実上の標準。`limits` ライブラリベースで、インメモリまたは Redis バックエンドを選択可能。
> **出典**: [slowapi PyPI](https://pypi.org/project/slowapi/), [slowapi Documentation](https://slowapi.readthedocs.io/)

### 2.2 Docker ベースイメージ確定

| イメージ | 現在 | 変更後 | 根拠 |
|---------|------|--------|------|
| Python | `python:3.12-slim` | `python:3.12.12-slim` | 2025-10-09 リリース。セキュリティ修正のみフェーズ |
| Node.js | `node:20-slim` | `node:20.20.0-slim` | 2026-01-13 セキュリティリリース |
| PostgreSQL | `postgres:16` | `postgres:16.11` | 2025-11-20 リリース。セキュリティ修正 |

> **出典**: [Python 3.12.12](https://www.python.org/downloads/release/python-31212/), [Node.js 20.20.0](https://nodejs.org/en/blog/vulnerability/december-2025-security-releases), [PostgreSQL 16.11](https://www.postgresql.org/docs/release/16.11/)
>
> **注意**: Node.js 20.x は 2026-04-30 に EOL。Phase 2 で Node.js 22.x への移行を計画する。
>
> **v2.1 修正**: PostgreSQL 16.12 は 2026-02-12 リリース予定であったが、実装日（2026-02-11）時点では未リリースだったため 16.11 を使用。16.12 リリース後のアップグレードは Phase 2 で対応。

---

## 3. セキュリティ設計

### 3.1 API Key 認証

#### 3.1.1 方針

- `X-API-Key` ヘッダーによる認証を全 write エンドポイントに適用
- FastAPI `APIKeyHeader` + `Security()` dependency を使用
- 環境変数 `API_KEYS`（カンマ区切り）で許可キーを管理
- FastAPI 0.128+ では `auto_error=True` 時に 401 Unauthorized を返す（0.122.0 で修正済み）

> **出典**: [FastAPI Security — APIKeyHeader](https://fastapi.tiangolo.com/reference/security/), [FastAPI 0.122.0 — 401 status fix](https://fastapi.tiangolo.com/how-to/authentication-error-status-code/)

#### 3.1.2 Settings 変更 — `api/app/config.py`

`Settings` クラスに以下を追加:

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `api_keys` | `str` | `""` | 許可 API キー。環境変数 `API_KEYS` からカンマ区切り文字列で読み込み |
| `cors_origins` | `str` | `"http://localhost:3100,http://localhost:3000"` | 許可オリジン（既存フィールドの型変更） |

**パース方式**: `str` 型 + 明示的メソッドでカンマ区切り分割。

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    cors_origins: str = "http://localhost:3100,http://localhost:3000"
    api_keys: str = ""

    def get_cors_origins(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]

    def get_api_keys(self) -> list[str]:
        if not self.api_keys:
            return []
        return [s.strip() for s in self.api_keys.split(",") if s.strip()]
```

> **v2.1 修正 — `env_parse_delimiter` は使用しない**
>
> v2.0 では `env_parse_delimiter=","` と `list[str]` 型の組合せを設計したが、これは動作しない。pydantic-settings の `EnvSettingsSource` は `list[str]` を complex type と判定し、`json.loads()` によるパースを最初に試行する。`env_parse_delimiter` によるフォールバック分割はこのコードパスでは機能せず、`json.loads("http://localhost:3100,http://localhost:3000")` が `JSONDecodeError` で失敗する。
>
> また、Pydantic の `field_validator(mode="before")` も対策にならない。`field_validator` は Pydantic モデルのバリデーション段階で実行されるが、エラーはその前段の pydantic-settings ソース収集段階（`EnvSettingsSource.__call__`）で発生するため、validator に到達しない。
>
> **根拠**: pydantic-settings `EnvSettingsSource` のコードフロー: `__call__` → `prepare_field_value` → `decode_complex_value` → `json.loads()` → `JSONDecodeError` → `SettingsError`。
>
> **対策**: `list[str]` ではなく `str` 型を使用し、complex type の JSON パースを回避する。利用側では `get_cors_origins()` / `get_api_keys()` メソッドでリストを取得する。

`.env` / `.env.example` のフォーマット（カンマ区切り文字列）:
```
CORS_ORIGINS=http://localhost:3100,http://localhost:3000
API_KEYS=key1,key2
```

`validate_production()` は `get_api_keys()` / `get_cors_origins()` を使用してバリデーションを行う。本番環境で API キーが未設定の場合、起動時にエラーを発生させる。

#### 3.1.3 認証 dependency — `api/app/dependencies.py`（新規）

新規ファイルを作成し、認証 dependency を定義する。

| 要素 | 仕様 |
|------|------|
| `api_key_header` | `APIKeyHeader(name="X-API-Key", auto_error=False)` |
| `verify_api_key()` | `Security(api_key_header)` で受け取り、`settings.api_keys` と照合。不一致時 `HTTPException(401)` |
| OpenAPI 統合 | `Security()` 使用により Swagger UI にロックアイコン表示 |

`auto_error=False` とする理由: デフォルトの `auto_error=True` でも 401 が返るが、カスタムエラーメッセージ（`"Invalid or missing API key"`）を統一するため、明示的に制御する。

#### 3.1.4 ルーター変更

対象エンドポイントに `api_key: str = Security(verify_api_key)` を追加:

| エンドポイント | ファイル | 変更内容 |
|---------------|---------|----------|
| `POST /ingest` | `routers/ingest.py` | `verify_api_key` dependency 追加 |
| `POST /articles` | `routers/articles.py` | `verify_api_key` dependency 追加 |
| `POST /digest` | `routers/digest.py` | `verify_api_key` dependency 追加 |

GET エンドポイントは変更なし（公開読み取り）。

#### 3.1.5 テスト影響

既存テストの POST リクエストに `X-API-Key` ヘッダーを追加する必要がある。conftest.py に以下を追加:

- テスト用 API キー定数（例: `TEST_API_KEY = "test-key-for-testing"`）
- テスト用 `Settings` オーバーライドで `api_keys` にテストキーを設定
- ヘルパーメソッドまたは fixture で `headers={"X-API-Key": TEST_API_KEY}` を提供

---

### 3.2 レート制限

#### 3.2.1 方針

- slowapi 0.1.9 を使用。IP アドレスベース（`get_remote_address`）
- 単一インスタンス構成のためインメモリストレージ
- エンドポイントごとに `@limiter.limit()` デコレータで制限値を設定
- 429 Too Many Requests + `Retry-After` ヘッダーを返却

> **出典**: [slowapi Documentation](https://slowapi.readthedocs.io/), [OWASP API4:2023](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)

#### 3.2.2 セットアップ — `api/app/main.py` への変更

1. `Limiter` インスタンスを作成（`key_func=get_remote_address`）
2. `app.state.limiter = limiter` でアプリに紐付け
3. `app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)` で 429 ハンドラ登録
4. `app.add_middleware(SlowAPIMiddleware)` を追加

**ミドルウェア追加順序**: SlowAPIMiddleware → SecurityHeadersMiddleware → CORSMiddleware（外側から内側の順で追加。Starlette はスタック型のため、`add_middleware` の呼び出し順が逆になる）

#### 3.2.3 エンドポイント別制限値

| エンドポイント | 制限値 | デコレータ | `request: Request` 引数 |
|---------------|--------|-----------|------------------------|
| `POST /ingest` | `10/minute` | `@limiter.limit("10/minute")` | 既存の sync def に追加 |
| `POST /articles` | `30/minute` | `@limiter.limit("30/minute")` | 追加 |
| `POST /digest` | `5/minute` | `@limiter.limit("5/minute")` | 追加 |
| `GET /articles` | `60/minute` | `@limiter.limit("60/minute")` | 追加 |
| `GET /articles/check` | `100/minute` | `@limiter.limit("100/minute")` | 追加 |
| `GET /articles/{id}` | `60/minute` | `@limiter.limit("60/minute")` | 追加 |
| `GET /digest` | `60/minute` | `@limiter.limit("60/minute")` | 追加 |
| `GET /digest/{date}` | `60/minute` | `@limiter.limit("60/minute")` | 追加 |
| `GET /health` | 制限なし | — | — |
| `GET /articles/stream` | 同時接続 20 | SSEBroker で制御 | — |

**重要**: slowapi の `@limiter.limit()` は `request: Request` パラメータがエンドポイント関数のシグネチャに必要。現在のルーターで `request` 引数がないエンドポイントにはパラメータを追加する。

#### 3.2.x テスト環境でのレート制限無効化

slowapi がテストを不安定化することを防ぐため、テスト環境ではレート制限を無効化する。

| 項目 | 仕様 |
|------|------|
| 方式 | `limiter.enabled = False` をテストセットアップで設定 |
| 適用場所 | `api/tests/conftest.py` の `client` fixture 内 |
| 条件 | `ENVIRONMENT=testing` または fixture 内で直接無効化 |

`conftest.py` での対応:

```python
@pytest.fixture(scope="function")
async def client(db_session):
    app.dependency_overrides[get_session] = lambda: db_session
    # テスト中はレート制限を無効化
    app.state.limiter.enabled = False
    async with AsyncClient(...) as ac:
        yield ac
    app.state.limiter.enabled = True
    app.dependency_overrides.clear()
```

> **根拠**: [slowapi — Limiter.enabled](https://slowapi.readthedocs.io/) — `Limiter` インスタンスの `enabled` プロパティを `False` に設定すると、すべてのレート制限チェックがスキップされる。

#### 3.2.4 SSE 同時接続制限 — `api/app/services/sse_broker.py`

`SSEBroker.subscribe()` に接続数チェックを追加:

| 項目 | 仕様 |
|------|------|
| 最大同時接続数 | 20 |
| 超過時 | `ConnectionLimitExceeded` 例外を送出 |
| ルーター側 | `stream_articles` で例外をキャッチし、`HTTPException(503, "Too many SSE connections")` を返す |

---

### 3.3 セキュリティヘッダー

#### 3.3.1 方針

Starlette `BaseHTTPMiddleware` を継承したカスタムミドルウェアで、全レスポンスにセキュリティヘッダーを付与する。

> **出典**: [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html), [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)

#### 3.3.2 実装ファイル — `api/app/middleware.py`（新規）

`SecurityHeadersMiddleware` クラスを定義。`dispatch` メソッド内で `call_next(request)` の後にヘッダーを設定して返す。

| ヘッダー | 値 |
|---------|-----|
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Cache-Control` | `no-store` |
| `Content-Security-Policy` | パスにより分岐（下記参照） |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-XSS-Protection` | `0` |

**CSP のパス別分岐**:

`default-src 'none'` は FastAPI の Swagger UI (`/docs`) および ReDoc (`/redoc`) の JS/CSS をブロックする。以下の方針で対応する:

| 環境 | `/docs`, `/redoc`, `/openapi.json` | その他のパス |
|------|-----------------------------------|------------|
| 本番 (`production`) | `docs_url=None, redoc_url=None` で無効化 | `default-src 'none'; frame-ancestors 'none'` |
| 開発 (`development`) | CSP ヘッダーを付与しない（スキップ） | `default-src 'none'; frame-ancestors 'none'` |

実装方針:
- `main.py` で `settings.environment == "production"` の場合、`FastAPI(docs_url=None, redoc_url=None)` で Swagger UI を無効化
- `SecurityHeadersMiddleware` の `dispatch` 内で、`request.url.path` が `/docs`、`/redoc`、`/openapi.json` の場合は CSP ヘッダーをスキップ

#### 3.3.3 `main.py` への統合

`app.add_middleware(SecurityHeadersMiddleware)` を CORSMiddleware の前に追加する（Starlette のミドルウェアスタックは LIFO のため、`add_middleware` の呼び出しは CORS → SecurityHeaders の順）。

本番環境では Swagger UI を無効化:
```python
app = FastAPI(
    title="Tech News Curator API",
    version="1.2.0",
    lifespan=lifespan,
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None if settings.environment == "production" else "/redoc",
)
```

---

### 3.4 Pydantic 入力検証強化

#### 3.4.1 `AppBaseModel` 変更 — `api/app/schemas/__init__.py`

現在の `ConfigDict`:
```python
model_config = ConfigDict(
    from_attributes=True,
    str_strip_whitespace=True,
)
```

変更後:
```python
model_config = ConfigDict(
    from_attributes=True,
    str_strip_whitespace=True,
    str_max_length=65536,
    extra="forbid",
    validate_default=True,
)
```

| 設定 | 値 | 目的 | 根拠 |
|------|-----|------|------|
| `str_max_length` | `65536` | 全文字列フィールドのグローバル上限（防御的制約） | [Pydantic v2 ConfigDict](https://docs.pydantic.dev/latest/concepts/config/) |
| `extra` | `"forbid"` | 未知フィールドの拒否（マスアサインメント防止） | [OWASP API3:2023](https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/) |
| `validate_default` | `True` | デフォルト値もバリデーション対象 | Pydantic v2 推奨 |

> **出典**: [Pydantic v2 ConfigDict](https://docs.pydantic.dev/latest/api/config/)

#### 3.4.2 `ArticleCreate` スキーマ変更 — `api/app/schemas/article.py`

各フィールドに `Field()` 制約を追加:

| フィールド | 現在 | 変更後 |
|-----------|------|--------|
| `source_url` | `str` | `HttpUrl` (Pydantic型) |
| `source_name` | `Optional[str]` | `Optional[str] = Field(None, max_length=100)` |
| `title_original` | `Optional[str]` | `Optional[str] = Field(None, max_length=500)` |
| `title_ja` | `Optional[str]` | `Optional[str] = Field(None, max_length=500)` |
| `body_original` | `Optional[str]` | `Optional[str] = Field(None, max_length=200000)` |
| `body_translated` | `Optional[str]` | `Optional[str] = Field(None, max_length=200000)` |
| `summary_ja` | `Optional[str]` | `Optional[str] = Field(None, max_length=5000)` |
| `author` | `Optional[str]` | `Optional[str] = Field(None, max_length=200)` |
| `og_image_url` | `Optional[str]` | `Optional[str] = Field(None, max_length=2083)` |
| `categories` | `Optional[list[str]]` | `Optional[list[Annotated[str, Field(max_length=50)]]] = Field(None, max_length=20)` |

`source_url` の型変更に伴い、`article_service.create_article()` 内で `str(data.source_url)` に変換する処理を追加（`HttpUrl` は Pydantic の `Url` 型オブジェクトのため）。

#### 3.4.3 `DigestCreate` スキーマ変更 — `api/app/schemas/digest.py`

| フィールド | 現在 | 変更後 |
|-----------|------|--------|
| `title` | `Optional[str]` | `Optional[str] = Field(None, max_length=500)` |
| `content` | `Optional[str]` | `Optional[str] = Field(None, max_length=100000)` |
| `article_count` | `Optional[int]` | `Optional[int] = Field(None, ge=0, le=10000)` |
| `article_ids` | `Optional[list[uuid.UUID]]` | `Optional[list[uuid.UUID]] = Field(None, max_length=1000)` |

#### 3.4.4 影響分析

- `extra="forbid"` により、既存の n8n ワークフローが未定義フィールドを送信している場合は 422 エラーとなる。n8n 側のペイロードが `ArticleCreate` / `DigestCreate` のフィールドのみ含むことを確認する必要がある。
- `source_url` の `str` → `HttpUrl` 変更は、URL バリデーションを自動化するが、`model_dump()` の出力が `Url` オブジェクトになる。`create_article()` で `str()` 変換が必要。

---

### 3.5 CORS 本番検証

#### 3.5.1 方針

`config.py` の `validate_production()` に、`cors_origins` に `localhost` を含むオリジンがないかのチェックを追加する。

#### 3.5.2 変更内容 — `api/app/config.py`

`validate_production()` に追加:
- `environment == "production"` 時、`cors_origins` の各エントリに `localhost` または `127.0.0.1` が含まれる場合、`ValueError` を送出

#### 3.5.3 CORS 許可ヘッダー変更 — `api/app/main.py`

現在:
```python
allow_headers=["Content-Type", "Accept"]
```

変更後:
```python
allow_headers=["Content-Type", "Accept", "X-API-Key"]
```

`X-API-Key` ヘッダーを CORS 許可ヘッダーに追加。これにより n8n やブラウザからの認証付きリクエストが CORS プリフライトを通過する。

---

### 3.6 エラーハンドリング改善

#### 3.6.1 方針

- `SQLAlchemyError` をルーター/グローバルハンドラでキャッチし、内部情報を漏洩させない
- `IntegrityError` → 409（既存の処理を維持）
- その他の `SQLAlchemyError` → 500（`{"detail": "Internal server error"}`）
- スタックトレースはサーバーサイドのロガーにのみ出力

> **出典**: [FastAPI Handling Errors](https://fastapi.tiangolo.com/tutorial/handling-errors/), [SQLAlchemy 2.0 Core Exceptions](https://docs.sqlalchemy.org/en/20/core/exceptions.html)

#### 3.6.2 グローバル例外ハンドラ — `api/app/main.py`

`app.exception_handler(SQLAlchemyError)` を登録し、以下の処理を行う:

1. `IntegrityError` の場合: 409 を返す（ただし、各ルーターで既にキャッチしている場合はここに到達しない。安全網として設置）
2. その他の `SQLAlchemyError`: `logger.exception()` でログ出力 → `JSONResponse(500, {"detail": "Internal server error"})` を返す

#### 3.6.3 汎用例外ハンドラ — `api/app/main.py`

`app.exception_handler(Exception)` を登録:

1. `logger.exception()` でログ出力
2. `JSONResponse(500, {"detail": "Internal server error"})` を返す

**注意**: FastAPI のデフォルトハンドラは開発モードでスタックトレースを返すが、本番では情報漏洩のリスクがある。明示的なハンドラで安全なレスポンスを保証する。

---

### 3.7 フロントエンド `server-only`

#### 3.7.1 方針

`frontend/src/lib/api.ts` に `import "server-only"` を追加し、Client Component から誤ってインポートされた場合にビルドエラーを発生させる。

> **出典**: [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

#### 3.7.2 変更内容

1. `npm install server-only` を `frontend/` で実行
2. `frontend/src/lib/api.ts` の先頭に `import "server-only"` を追加

これにより、`API_URL`（内部 Docker ネットワークアドレス）が誤ってクライアントサイドに漏洩することを防止する。

---

## 4. インフラ設計

### 4.1 Docker Compose ファイル設計

#### 4.1.1 3ファイル構成

Docker Compose の `ports`, `cap_drop` 等のシーケンス（リスト）属性は、複数ファイルのマージ時に**連結（append）**される。上書き（replace）はできない。

> **出典**: [Docker Compose Merge](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/) — *"A YAML sequence is merged by appending values from the overriding Compose file to the previous one."*
>
> [Docker Compose Issue #2260](https://github.com/docker/compose/issues/2260) — `ports` の上書きが不可能な問題（2015年から報告されている既知の制限）。Docker Compose 2.24.4+ で `!override` / `!reset` タグが追加されたが、ツールの互換性が低い。

このため、環境ごとに異なる値が必要なシーケンス属性（`ports`, `cap_drop`）はベースファイルに書かず、環境別 override ファイルに分離する。

| ファイル | 役割 | 内容 |
|---------|------|------|
| `docker-compose.yml` | ベース（共通定義） | サービス定義、ネットワーク、ボリューム、環境変数、healthcheck。**ポート・リソース制限・cap_drop は含めない** |
| `docker-compose.dev.yml` | 開発用 override | ポート（`0.0.0.0` バインド）、ボリュームマウント、reload コマンド、リソース制限なし |
| `docker-compose.prod.yml` | 本番用 override（新規） | ポート（`127.0.0.1` バインド）、リソース制限、`cap_drop`、`restart` ポリシー |

Makefile の変数定義:
```makefile
COMPOSE_DEV  = docker compose -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml
```

| コマンド | 使用ファイル |
|---------|-------------|
| `make dev` | `$(COMPOSE_DEV) up --build` |
| `make up` / `make deploy` | `$(COMPOSE_PROD) up -d` |
| `make down` | `docker compose down` |

> **v2.1 修正**: v2.0 ではベース `docker-compose.yml` にポート・リソース制限・`cap_drop` を定義していた。しかし Docker Compose のシーケンスマージ仕様により、dev override で `ports` や `cap_drop` を上書きできない。スカラー値（`mem_limit`, `cpus`）は上書き可能だが、フロントエンドの `mem_limit: 256m` が Next.js dev サーバーの OOM kill を引き起こしていた（[Next.js Memory Usage Guide](https://nextjs.org/docs/app/guides/memory-usage), [vercel/next.js #88603](https://github.com/vercel/next.js/discussions/88603)）。

#### 4.1.2 ネットワーク構成（ベース compose）

```yaml
networks:
  frontend-net:
    driver: bridge
  backend-net:
    driver: bridge
    internal: true
```

| サービス | frontend-net | backend-net |
|---------|-------------|-------------|
| news-frontend | Yes | No |
| news-api | Yes | Yes |
| news-db | No | Yes |

> **出典**: [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)

#### 4.1.3 ポート設計

**ベース `docker-compose.yml`**: ポート定義なし（環境別 override に委譲）。

| サービス | dev override | prod override | 根拠 |
|---------|-------------|--------------|------|
| news-api | `"8100:8100"` | `"127.0.0.1:8100:8100"` | 本番はリバースプロキシ経由 |
| news-frontend | `"3100:3000"` | `"3100:3000"` | フロントエンドは直接アクセス |
| news-db | `"127.0.0.1:5432:5432"` | なし | 本番では DB ポート非公開 |

#### 4.1.4 Next.js dev サーバーのホストバインド

`next dev` は**デフォルトで `0.0.0.0` にバインド**する。`--hostname 0.0.0.0` フラグは不要。

> **出典**: [Next.js CLI Reference (v16.1.6)](https://nextjs.org/docs/app/api-reference/cli/next) — `-H` or `--hostname <hostname>` — *"Specify a hostname on which to start the application. Default: 0.0.0.0"*

dev override の command は元の `npm run dev` で良い。

---

### 4.2 ベースイメージ・Dockerfile 強化

#### 4.2.1 `api/Dockerfile` 変更

| 項目 | 現在 | 変更後 |
|------|------|--------|
| ベースイメージ | `python:3.12-slim` | `python:3.12.12-slim` |
| HEALTHCHECK | なし | `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8100/health')"]` |
| EXPOSE | なし | `EXPOSE 8100` |

#### 4.2.2 `frontend/Dockerfile` 変更

| 項目 | 現在 | 変更後 |
|------|------|--------|
| builder イメージ | `node:20-slim` | `node:20.20.0-slim` |
| production イメージ | `node:20-slim` | `node:20.20.0-slim` |
| dev イメージ | `node:20-slim` | `node:20.20.0-slim` |
| HEALTHCHECK | なし | `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["node", "-e", "fetch('http://localhost:3000').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]` |

#### 4.2.3 PostgreSQL イメージ変更

`docker-compose.yml`:

```yaml
news-db:
  image: postgres:16.11
```

---

### 4.3 .dockerignore 作成

#### 4.3.1 `api/.dockerignore`（新規）

```
.env
.env.*
.git
.gitignore
__pycache__
*.py[cod]
*.egg-info
.pytest_cache
.venv
venv
tests/
docs/
*.md
.DS_Store
.idea
.vscode
```

#### 4.3.2 `frontend/.dockerignore`（新規）

```
.env
.env.*
.git
.gitignore
node_modules
.next
out
build
coverage
e2e/
docs/
*.md
.DS_Store
.idea
.vscode
```

---

### 4.4 リソース制限・再起動ポリシー・ケーパビリティ

#### 4.4.1 配置先: `docker-compose.prod.yml`（本番 override のみ）

**注意**: `deploy` セクションのリソース制限は Docker Swarm モードでのみ有効であり、`docker compose`（非 Swarm）では無視される。本プロジェクトは `docker compose` 前提のため、**サービスレベルの `mem_limit` / `cpus` / `restart`** を使用する。

> **出典**: [Docker Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints/) — `mem_limit` と `cpus` は `docker compose` で直接サポートされる。`deploy.resources` は Swarm モード専用。

> **v2.1 修正 — ベース compose には配置しない**
>
> v2.0 ではベース `docker-compose.yml` にリソース制限を配置する設計だった。しかし以下の問題が判明:
>
> 1. **`mem_limit: 256m`（frontend）**: Next.js dev サーバー（Turbopack デフォルト有効）は 256MB では OOM kill される。[Next.js Memory Usage Guide](https://nextjs.org/docs/app/guides/memory-usage) および [vercel/next.js #88603](https://github.com/vercel/next.js/discussions/88603) によると、dev サーバーのメモリ使用量は 512MB 以上が一般的。
> 2. **`cap_drop: [ALL]`**: シーケンス属性のため dev override で削除不可（§4.1.1 参照）。
> 3. **`restart: "on-failure:3"`**: OOM kill 時に 3 回リトライ後にサイレントに停止し、デバッグが困難。
>
> これらの設定は**本番 override (`docker-compose.prod.yml`) のみに配置**する。dev override では定義しない（制限なし）。

#### 4.4.2 本番リソース制限（`docker-compose.prod.yml`）

| サービス | `cpus` | `mem_limit` | `restart` |
|---------|--------|-------------|-----------|
| news-api | `"1.0"` | `512m` | `on-failure:3` |
| news-frontend | `"0.5"` | `256m` | `on-failure:3` |
| news-db | `"1.0"` | `1g` | `on-failure:3` |

**注意**: フロントエンドの本番 `mem_limit: 256m` は Next.js standalone サーバー（`node server.js`）向け。standalone ビルドは dev サーバーより大幅に軽量であり、256MB で動作する。

#### 4.4.3 Linux ケーパビリティ削除（`docker-compose.prod.yml`）

`cap_drop: [ALL]` は**本番 override のみ**に配置する。

> **出典**: [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)

**PostgreSQL には追加ケーパビリティが必要**:

PostgreSQL コンテナはデータディレクトリのパーミッション管理に以下のケーパビリティを必要とする。`cap_drop: [ALL]` のみでは `chmod: changing permissions of '/var/lib/postgresql/data': Operation not permitted` で起動に失敗する。

```yaml
# docker-compose.prod.yml
news-db:
  cap_drop:
    - ALL
  cap_add:
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    - SETGID
    - SETUID
```

| ケーパビリティ | 用途 |
|--------------|------|
| `CHOWN` | データファイルの所有者変更 |
| `DAC_OVERRIDE` | ファイルパーミッションチェックのバイパス |
| `FOWNER` | ファイルパーミッション変更 |
| `SETGID` / `SETUID` | postgres ユーザーへの切り替え |

API・フロントエンドは `cap_drop: [ALL]` のみで動作する（非特権ポート使用、ユーザー切り替え不要）。

---

### 4.5 PostgreSQL 認証強化

#### 4.5.1 scram-sha-256

PostgreSQL 14+ の Docker イメージはデフォルトで `scram-sha-256` を使用するため、`POSTGRES_HOST_AUTH_METHOD` の明示設定は不要。ただし、`POSTGRES_INITDB_ARGS` で明示的に指定して意図を文書化する。

> **出典**: [Docker PostgreSQL — Host Auth Method](https://hub.docker.com/_/postgres), [PostgreSQL Password Auth](https://www.postgresql.org/docs/current/auth-password.html)

`docker-compose.yml` の `news-db` に追加:

```yaml
environment:
  POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
```

#### 4.5.2 DB ユーザー分離

`docker-entrypoint-initdb.d` に初期化スクリプトを配置し、アプリ用ユーザーを作成する。

**`db/init/01-create-app-user.sql`（新規）**:

- `POSTGRES_USER`（`news`）はマイグレーション用（DDL 権限を保持）
- アプリ用ユーザー `news_app` を作成（DML のみ: SELECT, INSERT, UPDATE）
- DELETE 権限は付与しない（論理削除パターンに対応）

**実行フロー**:
1. Docker が `POSTGRES_USER`=`news` でコンテナを初期化
2. `01-create-app-user.sql` が `news` ユーザーで実行され、`news_app` を作成
3. Alembic マイグレーションは `news` ユーザーで実行（DDL 権限あり）
4. アプリケーションは `news_app` ユーザーで接続（DML のみ）

**環境変数の追加**:

| 変数 | 用途 | 例 |
|------|------|-----|
| `DATABASE_URL` | アプリ用接続（`news_app`） | `postgresql+asyncpg://news_app:pass@news-db:5432/news_curator` |
| `DATABASE_ADMIN_URL` | マイグレーション用（`news`） | `postgresql+asyncpg://news:pass@news-db:5432/news_curator` |
| `NEWS_APP_PASSWORD` | アプリユーザーパスワード | `$(openssl rand -base64 16)` |

**`docker-compose.yml` の変更**:

`news-db` サービスにボリュームマウントを追加:
```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
  - ./db/init:/docker-entrypoint-initdb.d:ro
```

**`news-api` の環境変数変更**:
- `DATABASE_URL`: `news` → `news_app` ユーザーに変更

**Alembic 設定変更** — `api/alembic.ini` または `api/alembic/env.py`:
- マイグレーション用に `DATABASE_ADMIN_URL` 環境変数を参照するよう設定

**`api/app/config.py` の変更**:

| フィールド | 説明 |
|-----------|------|
| `database_admin_url` | マイグレーション用 URL（`news` ユーザー） |

**注意点**:
- `GRANT` は初期化スクリプトで実行されるが、テーブルは Alembic マイグレーション後に作成される。そのため、`DEFAULT PRIVILEGES` を使用して将来作成されるテーブルにも権限を自動付与する。
- `ALTER DEFAULT PRIVILEGES FOR ROLE news IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO news_app;`
- `ALTER DEFAULT PRIVILEGES FOR ROLE news IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO news_app;`

---

### 4.6 `.env.example` 更新

Phase 1.2 の新規環境変数を反映:

```
POSTGRES_PASSWORD=<secure-password>
NEWS_APP_PASSWORD=<secure-password-for-app-user>
REGISTRY=<your-registry-url>
API_KEYS=<key1>,<key2>
CORS_ORIGINS=http://localhost:3100,http://localhost:3000
ENVIRONMENT=development
```

> **v2.1 修正**: `CORS_ORIGINS` を JSON 配列形式からカンマ区切り形式に統一。Settings の `cors_origins` は `str` 型であり、`get_cors_origins()` メソッドでカンマ分割する（§3.1.2 参照）。

---

## 5. 品質向上設計

### 5.1 サービス層テスト追加

#### 5.1.1 テスト対象と計画

| サービス | 現状 | 追加テスト | ファイル |
|---------|------|-----------|---------|
| `article_service` | テストなし | 6 テスト | `tests/test_article_service.py`（新規） |
| `digest_service` | テストなし | 6 テスト | `tests/test_digest_service.py`（新規） |
| `article_monitor` | 1 テスト（部分） | 3 テスト追加 | `tests/test_article_monitor.py`（新規） |

#### 5.1.2 `test_article_service.py` テストケース

| テスト | 内容 |
|--------|------|
| `test_check_article_exists_true` | 存在する URL で `True` を返す |
| `test_check_article_exists_false` | 存在しない URL で `False` を返す |
| `test_create_article_success` | 正常な記事作成と返り値の検証 |
| `test_create_article_duplicate_url` | 重複 URL で `IntegrityError` を送出 |
| `test_get_articles_pagination` | ページネーションの正確性（total, offset, limit） |
| `test_get_articles_date_filter` | 日付フィルタの半開区間 `[start, start+1day)` |

#### 5.1.3 `test_digest_service.py` テストケース

| テスト | 内容 |
|--------|------|
| `test_create_digest_success` | 正常なダイジェスト作成 |
| `test_create_digest_duplicate_date` | 重複日付で `IntegrityError` を送出 |
| `test_get_digests_pagination` | ページネーションの正確性 |
| `test_get_digests_ordering` | `digest_date` 降順の確認 |
| `test_get_digest_by_date_found` | 存在する日付で `Digest` を返す |
| `test_get_digest_by_date_not_found` | 存在しない日付で `None` を返す |

#### 5.1.4 `test_article_monitor.py` テストケース

| テスト | 内容 |
|--------|------|
| `test_monitor_broadcasts_new_articles` | 新規記事が SSE ブローカーにブロードキャストされる |
| `test_monitor_skips_when_no_clients` | クライアント 0 の場合、DB クエリをスキップ |
| `test_monitor_recovers_from_db_error` | DB エラー後にポーリングが継続される |
| `test_monitor_advances_last_checked` | ブロードキャスト後に `last_checked` が更新される |

#### 5.1.5 テスト構成

既存の `conftest.py` のフィクスチャ（`postgres_container`, `db_engine`, `db_session`）を再利用する。サービス層テストは DB セッションを直接注入し、HTTP クライアントは不要。

---

### 5.2 認証テスト追加

#### 5.2.1 既存テストへの影響

| テストファイル | 影響 |
|--------------|------|
| `test_ingest.py` | POST リクエストに `X-API-Key` ヘッダー追加 |
| `test_articles.py` | POST リクエストに `X-API-Key` ヘッダー追加 |
| `test_digest.py` | POST リクエストに `X-API-Key` ヘッダー追加 |

#### 5.2.2 認証テストケース追加

各 POST エンドポイントに以下のテストを追加:

| テスト | 内容 | 期待結果 |
|--------|------|---------|
| `test_*_without_api_key` | API キーなしでリクエスト | 401 Unauthorized |
| `test_*_with_invalid_api_key` | 無効な API キーでリクエスト | 401 Unauthorized |

---

### 5.3 エラーバウンダリ

#### 5.3.1 方針

Next.js 16 の `error.tsx` 規約に従い、ルートレイアウトにエラーバウンダリを追加する。

#### 5.3.2 ファイル構成

| ファイル | 内容 |
|---------|------|
| `frontend/src/app/error.tsx` | ルートエラーバウンダリ（Client Component） |

`error.tsx` は `"use client"` が必要。`Error` オブジェクトと `reset()` 関数を props で受け取り、ユーザーにリトライ UI を提供する。

---

### 5.4 アクセシビリティ改善

#### 5.4.1 対象コンポーネントと変更

| コンポーネント | 変更内容 |
|--------------|----------|
| `Header.tsx` | `<nav>` に `aria-label="メインナビゲーション"` 追加 |
| `ArticleGrid.tsx` | 既存の `aria-label="記事一覧"` を確認（対応済み） |
| `HeroSection.tsx` | 既存の `aria-label="注目記事"` を確認（対応済み） |
| `ArticleListLive.tsx` | 新着通知に `aria-live="polite"` 追加 |
| `ArticleCard.tsx` | `<article>` に `aria-label` 追加（記事タイトル） |
| `Footer.tsx` | `<footer>` に `role="contentinfo"` 追加 |

---

### 5.5 CI/CD セキュリティスキャン

#### 5.5.1 GitHub Actions ワークフロー — `.github/workflows/security.yml`（新規）

```
トリガー: PR 作成/更新 (push to feature/*, pull_request to main)

ジョブ:
  lint-and-type:
    - ruff check (Python lint)
    - mypy (型チェック、将来追加時)

  sast:
    - semgrep scan --config auto api/app/
    - bandit -r api/app/ -x api/tests/ -f json

  dependency-scan:
    - pip-audit -r api/requirements.txt -f json

  test:
    - pytest api/tests/ -v --tb=short

  docker-build:
    - docker build api/ (ビルドテスト)
    - docker build frontend/ (ビルドテスト)
```

#### 5.5.2 Makefile 変更

**v2.1 修正**: Makefile に `COMPOSE_DEV` / `COMPOSE_PROD` 変数を追加し、3ファイル構成に対応。

| 変数 | 値 |
|------|-----|
| `COMPOSE_DEV` | `docker compose -f docker-compose.yml -f docker-compose.dev.yml` |
| `COMPOSE_PROD` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml` |

| コマンド | 内容 |
|---------|------|
| `make dev` | `$(COMPOSE_DEV) up --build` |
| `make up` | `$(COMPOSE_PROD) up -d` |
| `make deploy` | `$(COMPOSE_PROD)` でDB→API→migration→frontend の順 |
| `make down` | `docker compose down` |
| `make lint` | `cd api && ruff check app/` |
| `make sast` | `cd api && bandit -r app/ -x tests/` |
| `make audit` | `cd api && pip-audit -r requirements.txt` |
| `make security` | `make lint && make sast && make audit` |

---

## 6. ファイル変更マトリクス

### 6.1 変更ファイル一覧

| ファイル | 種別 | 変更内容 |
|---------|------|----------|
| `api/app/config.py` | 変更 | `api_keys`, `database_admin_url` 追加、`validate_production()` 強化 |
| `api/app/main.py` | 変更 | ミドルウェア追加（slowapi, セキュリティヘッダー）、例外ハンドラ追加、CORS ヘッダー追加 |
| `api/app/schemas/__init__.py` | 変更 | `ConfigDict` に `str_max_length`, `extra`, `validate_default` 追加 |
| `api/app/schemas/article.py` | 変更 | `ArticleCreate` に `Field()` 制約追加、`source_url` を `HttpUrl` に変更 |
| `api/app/schemas/digest.py` | 変更 | `DigestCreate` に `Field()` 制約追加 |
| `api/app/routers/articles.py` | 変更 | `verify_api_key` 追加、`@limiter.limit` 追加、`request` 引数追加 |
| `api/app/routers/digest.py` | 変更 | `verify_api_key` 追加、`@limiter.limit` 追加、`request` 引数追加 |
| `api/app/routers/ingest.py` | 変更 | `verify_api_key` 追加、`@limiter.limit` 追加、`request` 引数追加 |
| `api/app/routers/sse.py` | 変更 | SSE 同時接続制限追加 |
| `api/app/services/article_service.py` | 変更 | `create_article()` で `HttpUrl` → `str` 変換追加 |
| `api/app/services/sse_broker.py` | 変更 | `subscribe()` に接続数上限チェック追加 |
| `api/requirements.txt` | 変更 | `slowapi==0.1.9` 追加 |
| `api/requirements-dev.txt` | 変更 | `bandit>=1.9.3`, `pip-audit>=2.10.0` 追加 |
| `api/Dockerfile` | 変更 | ベースイメージピン留め、`HEALTHCHECK`、`EXPOSE` 追加 |
| `api/tests/conftest.py` | 変更 | テスト用 API キー設定、Settings オーバーライド追加 |
| `api/tests/test_articles.py` | 変更 | POST リクエストに API キーヘッダー追加、認証テスト追加 |
| `api/tests/test_digest.py` | 変更 | POST リクエストに API キーヘッダー追加、認証テスト追加 |
| `api/tests/test_ingest.py` | 変更 | POST リクエストに API キーヘッダー追加、認証テスト追加 |
| `docker-compose.yml` | 変更 | ネットワーク分離、イメージピン留め、DB 初期化スクリプト。**ポート・リソース制限・cap_drop は含めない**（§4.1.1） |
| `docker-compose.dev.yml` | 変更 | 全サービスのポート定義（`0.0.0.0` バインド）、DB ポート（`127.0.0.1`）、ボリュームマウント、reload コマンド |
| `frontend/Dockerfile` | 変更 | ベースイメージピン留め、`HEALTHCHECK` 追加 |
| `frontend/src/lib/api.ts` | 変更 | `import "server-only"` 追加 |
| `frontend/src/app/error.tsx` | 変更 | 新着通知に `aria-live` 追加 |
| `frontend/src/components/Header.tsx` | 変更 | `aria-label` 追加 |
| `frontend/src/components/ArticleListLive.tsx` | 変更 | `aria-live="polite"` 追加 |
| `frontend/src/components/ArticleCard.tsx` | 変更 | `aria-label` 追加 |
| `frontend/src/components/Footer.tsx` | 変更 | `role="contentinfo"` 追加 |
| `Makefile` | 変更 | `COMPOSE_DEV`/`COMPOSE_PROD` 変数追加、`lint`, `sast`, `audit`, `security` コマンド追加 |
| `.env.example` | 変更 | `API_KEYS`, `NEWS_APP_PASSWORD`, `ENVIRONMENT` 追加 |

### 6.2 新規ファイル一覧

| ファイル | 内容 |
|---------|------|
| `api/app/dependencies.py` | API Key 認証 dependency |
| `api/app/rate_limit.py` | slowapi Limiter インスタンス（循環 import 回避のため `main.py` から分離） |
| `api/app/middleware.py` | セキュリティヘッダーミドルウェア |
| `docker-compose.prod.yml` | 本番用 override（ポート `127.0.0.1` バインド、リソース制限、`cap_drop`、`restart`） |
| `api/.dockerignore` | API ビルドコンテキスト除外 |
| `frontend/.dockerignore` | Frontend ビルドコンテキスト除外 |
| `db/init/01-create-app-user.sql` | DB アプリユーザー初期化 |
| `api/tests/test_article_service.py` | article_service 単体テスト |
| `api/tests/test_digest_service.py` | digest_service 単体テスト |
| `api/tests/test_article_monitor.py` | article_monitor テスト |
| `frontend/src/app/error.tsx` | エラーバウンダリ |
| `.github/workflows/security.yml` | CI/CD セキュリティスキャン |

---

## 7. 実装順序

Phase 1.2 の実装は以下の順序で行う。各ステップは独立してテスト可能。

| 順番 | 作業 | 依存関係 | ブランチ |
|------|------|---------|---------|
| 1 | Pydantic 入力検証強化（`AppBaseModel`, `ArticleCreate`, `DigestCreate`） | なし | `feature/phase1.2-input-validation` |
| 2 | API Key 認証（`dependencies.py`, `config.py`, ルーター変更, テスト更新） | 1（スキーマ変更後） | `feature/phase1.2-api-key-auth` |
| 3 | レート制限（slowapi セットアップ, デコレータ, SSE 接続制限） | 2 | `feature/phase1.2-rate-limiting` |
| 4 | セキュリティヘッダー・CORS・エラーハンドリング（`middleware.py`, `main.py`） | 1 | `feature/phase1.2-security-headers` |
| 5 | インフラ強化（Docker ネットワーク, イメージピン留め, .dockerignore, リソース制限, DB ユーザー分離） | なし | `feature/phase1.2-infra-hardening` |
| 6 | サービス層テスト追加 | 1, 2 | `feature/phase1.2-service-tests` |
| 7 | フロントエンド改善（`server-only`, `error.tsx`, アクセシビリティ） | なし | `feature/phase1.2-frontend-improvements` |
| 8 | CI/CD セキュリティスキャン | 1–7 | `feature/phase1.2-ci-security` |

---

## 8. テスト計画

### 8.1 テスト実行方法

```bash
# 全テスト実行
make test

# 個別テスト
cd api && python -m pytest tests/test_article_service.py -v
cd api && python -m pytest tests/test_articles.py::test_create_article_without_api_key -v

# セキュリティスキャン
make security
```

### 8.2 テスト網羅性

| テスト種別 | Phase 1.0/1.1 | Phase 1.2 追加 | 合計 |
|-----------|--------------|---------------|------|
| 統合テスト（articles） | 9 | 2（認証） | 11 |
| 統合テスト（digest） | 6 | 2（認証） | 8 |
| 統合テスト（health） | 1 | 0 | 1 |
| 統合テスト（ingest） | 7 | 2（認証） | 9 |
| 統合テスト（SSE） | 6 | 0 | 6 |
| 単体テスト（url_validator） | 8 | 0 | 8 |
| 単体テスト（article_service） | 0 | 6 | 6 |
| 単体テスト（digest_service） | 0 | 6 | 6 |
| 単体テスト（article_monitor） | 1 | 3 | 4 |
| **合計** | **38** | **21** | **59** |

### 8.3 手動検証項目

| 項目 | 検証方法 |
|------|---------|
| API Key 認証 | `curl -X POST /articles` で 401 確認。`-H "X-API-Key: valid"` で 201 確認 |
| レート制限 | `for i in {1..11}; do curl -X POST /ingest ...; done` で 429 確認 |
| セキュリティヘッダー | `curl -I /health` でヘッダー確認 |
| CORS | ブラウザ DevTools で preflight 確認 |
| ネットワーク分離 | `docker compose exec news-frontend ping news-db` で到達不可確認 |
| DB ユーザー分離 | `news_app` で `DROP TABLE` 実行し権限エラー確認 |
| `server-only` | `api.ts` を Client Component からインポートしてビルドエラー確認 |
| `error.tsx` | API を停止して `/articles` アクセスしエラー画面確認 |

---

## 9. 参考文献

| 文書 | URL |
|------|-----|
| OWASP API Security Top 10 (2023) | https://owasp.org/API-Security/editions/2023/en/0x11-t10/ |
| OWASP REST Security Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html |
| OWASP HTTP Headers Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html |
| OWASP Docker Security Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html |
| FastAPI Security Reference | https://fastapi.tiangolo.com/reference/security/ |
| FastAPI Error Handling | https://fastapi.tiangolo.com/tutorial/handling-errors/ |
| Pydantic v2 ConfigDict | https://docs.pydantic.dev/latest/api/config/ |
| Pydantic v2 Fields | https://docs.pydantic.dev/latest/concepts/fields/ |
| SQLAlchemy 2.0 Core Exceptions | https://docs.sqlalchemy.org/en/20/core/exceptions.html |
| slowapi Documentation | https://slowapi.readthedocs.io/ |
| slowapi PyPI | https://pypi.org/project/slowapi/ |
| server-only (npm) | https://www.npmjs.com/package/server-only |
| Next.js Server and Client Components | https://nextjs.org/docs/app/getting-started/server-and-client-components |
| Docker Build Best Practices | https://docs.docker.com/build/building/best-practices/ |
| Docker Resource Constraints | https://docs.docker.com/engine/containers/resource_constraints/ |
| Docker Compose Deploy | https://docs.docker.com/reference/compose-file/deploy/ |
| PostgreSQL Password Auth | https://www.postgresql.org/docs/current/auth-password.html |
| PostgreSQL GRANT | https://www.postgresql.org/docs/current/sql-grant.html |
| Docker PostgreSQL Official Image | https://hub.docker.com/_/postgres |
| Bandit Documentation | https://bandit.readthedocs.io/ |
| pip-audit GitHub | https://github.com/pypa/pip-audit |
| Semgrep FastAPI Analysis | https://semgrep.dev/blog/2024/redefining-security-coverage-for-python-with-framework-native-analysis/ |
| Docker Compose Merge (sequence concatenation) | https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/ |
| Docker Compose ports override issue #2260 | https://github.com/docker/compose/issues/2260 |
| Docker Compose !override/!reset (v2.24.4+) | https://docs.docker.com/reference/compose-file/merge/ |
| Next.js CLI Reference (v16.1.6) | https://nextjs.org/docs/app/api-reference/cli/next |
| Next.js Memory Usage Guide | https://nextjs.org/docs/app/guides/memory-usage |
| Next.js 16.1.0 OOM in Docker #88603 | https://github.com/vercel/next.js/discussions/88603 |
| PostgreSQL 16.11 Release Notes | https://www.postgresql.org/docs/release/16.11/ |
