# Tech News Aggregator - 要件仕様書 v2.0

> **Version**: 2.0
> **Date**: 2026-02-11
> **Base**: REQUIREMENTS.md v1.0 + コード品質・セキュリティ分析結果
> **Scope**: 全フェーズ統合（Phase 1 〜 Phase 3）
> **Architecture**: v4.1 Final（セキュリティ強化版）

---

## 変更履歴

| Version | Date | 変更内容 |
|---------|------|---------|
| 1.0 | 2025-02-06 | 初版（Phase 1 MVP スコープ） |
| 2.0 | 2026-02-11 | コード分析に基づく全フェーズ統合、セキュリティ・品質・テスト要件追加 |

### v2.0 主要変更点

- API Key認証をPhase 1.2に前倒し（分析結果: write endpointsの認証不在がCRITICAL）
- セキュリティ要件セクション新設（OWASP API Security Top 10 2023準拠）
- 入力検証要件セクション新設（Pydantic v2 Field制約）
- インフラストラクチャ要件セクション新設（Docker強化）
- テスト戦略セクション新設（単体・統合・E2E・セキュリティテスト）
- フェーズ計画を3段階から5段階に再編成

---

## 1. プロジェクト概要

### 1.1 目的

海外テックニュースを自動収集・翻訳・要約し、日本語で配信するシステム。

### 1.2 設計原則

- **n8nがすべてのフローと処理を制御**: RSS取得、重複判定、Ollama直接呼び出しによる翻訳・要約、保存指示まで
- **n8nがOllamaを直接叩く**: 翻訳・要約はn8nのHTTP RequestノードからOllama APIへ直接リクエスト
- **Docker APIは本文抽出・保存・配信のみ**: LLM処理を一切持たない。Ollama依存なし
- **ソース追加・プロンプト調整はn8n GUIのみで完結**: コード変更不要
- **セキュリティ・バイ・デフォルト**: 全write endpointにAPI Key認証、入力検証、レート制限を適用

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
│                                                               │
│  ┌─── frontend-net ──────────────────────────────────────┐    │
│  │                                                       │    │
│  │  ┌──────────────┐      ┌──────────────┐               │    │
│  │  │ news-frontend│ ───→ │  news-api    │               │    │
│  │  │  (Next.js)   │      │  (FastAPI)   │               │    │
│  │  │    :3100     │      │   :8100      │               │    │
│  │  └──────────────┘      └──────┬───────┘               │    │
│  │                               │                       │    │
│  └───────────────────────────────┼───────────────────────┘    │
│                                  │                            │
│  ┌─── backend-net (internal) ────┼───────────────────────┐    │
│  │                               │                       │    │
│  │                        ┌──────┴───────┐               │    │
│  │                        │   news-db    │               │    │
│  │                        │ (PostgreSQL) │               │    │
│  │                        │    :5432     │               │    │
│  │                        └──────────────┘               │    │
│  │                                                       │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**ネットワーク分離**: `backend-net`を`internal: true`に設定し、データベースへの外部アクセスを遮断する。

> **根拠**: [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) — カスタムブリッジネットワークでサービスをセグメント化し、DBネットワークには`internal: true`を設定してフロントエンドからの直接アクセスを防止する。

---

## 2. 機能要件

### 2.1 記事本文抽出 (POST /ingest) — Phase 1.0 ✅

| 項目 | 仕様 |
|------|------|
| 入力 | `{"url": "https://..."}` |
| 認証 | API Key必須（`X-API-Key`ヘッダー）— Phase 1.2で追加 |
| 処理 | trafilaturaで本文＋メタデータ抽出 |
| 出力 | タイトル、本文、著者、公開日、OG画像URL |
| SSRF防御 | URL検証（スキーム制限、プライベートIP遮断、DNSリバインド防止、リダイレクト再検証）— 実装済み |
| 失敗時 | エラーレスポンス（n8n側でRSS descriptionをfallback利用可能） |
| 備考 | **保存はしない**（n8nが翻訳・要約後にPOST /articlesで保存指示） |

### 2.2 重複チェック (GET /articles/check) — Phase 1.0 ✅

| 項目 | 仕様 |
|------|------|
| 入力 | `?url=https://...` |
| 認証 | 不要（読み取り専用） |
| 出力 | `{"exists": true/false}` |
| 用途 | n8nが記事処理前に既存チェック |
| レート制限 | 100回/分（Phase 1.2で追加） |

### 2.3 記事保存 (POST /articles) — Phase 1.0 ✅

| 項目 | 仕様 |
|------|------|
| 入力 | 原文、翻訳文、要約、メタデータを一括 |
| 認証 | API Key必須（`X-API-Key`ヘッダー）— Phase 1.2で追加 |
| 処理 | PostgreSQLに保存 |
| 入力検証 | 全フィールドにサイズ制約（§5参照） |
| 呼び出し元 | n8nのみ |

### 2.4 記事配信 (GET /articles, GET /articles/{id}) — Phase 1.0 ✅

| エンドポイント | 仕様 |
|----------------|------|
| GET /articles | 記事一覧（要約のみ）、ページネーション、日付フィルタ対応 |
| GET /articles/{id} | 記事詳細（要約 + 元記事リンク + メタデータ） |
| 認証 | 不要（公開読み取り） |
| レート制限 | 60回/分（Phase 1.2で追加） |

### 2.5 ダイジェスト (POST /digest, GET /digest, GET /digest/{date}) — Phase 1.0 ✅

| エンドポイント | 仕様 |
|----------------|------|
| POST /digest | n8nが生成したダイジェストを保存。API Key必須（Phase 1.2） |
| GET /digest | ダイジェスト一覧。認証不要 |
| GET /digest/{date} | 日付指定でダイジェスト取得（YYYY-MM-DD形式）。認証不要 |

### 2.6 ヘルスチェック (GET /health) — Phase 1.0 ✅

| 項目 | 仕様 |
|------|------|
| 出力 | `{"status": "healthy", "db": "connected"}` |
| 認証 | 不要 |
| 用途 | Docker / n8nからの死活監視 |

### 2.7 リアルタイム更新 (GET /articles/stream) — Phase 1.1 ✅

| 項目 | 仕様 |
|------|------|
| プロトコル | Server-Sent Events (SSE) |
| 出力 | 新規記事のJSON（タイトル、ID、要約） |
| 認証 | 不要（公開読み取り） |
| 接続制限 | 最大同時接続数を制限（Phase 1.2で追加） |

### 2.8 ソース管理 (Phase 2)

| エンドポイント | 仕様 |
|----------------|------|
| GET /sources | ソース一覧 |
| POST /sources | ソース追加。API Key必須 |
| PUT /sources/{id} | ソース更新。API Key必須 |
| DELETE /sources/{id} | ソース無効化（論理削除）。API Key必須 |

### 2.9 カテゴリ・タグ分類 (Phase 2)

| 項目 | 仕様 |
|------|------|
| 分類方法 | n8nがOllamaでカテゴリ推定 → POST /articlesのcategoriesフィールドに格納 |
| フィルタ | GET /articles?category=ai のクエリパラメータ対応 |
| タグ | metadataフィールドのJSONBにタグ配列を格納 |

### 2.10 RSS配信 (Phase 2)

| 項目 | 仕様 |
|------|------|
| エンドポイント | GET /feed/rss |
| フォーマット | RSS 2.0 XML |
| 内容 | 最新記事の要約（summary_ja） + 元記事リンク |
| 更新頻度 | リクエスト時に動的生成 |

### 2.11 ユーザー認証 (Phase 3)

| 項目 | 仕様 |
|------|------|
| 方式 | JWT（JSON Web Token） |
| プロバイダー | OAuth 2.0（Google、GitHub） |
| トークン有効期限 | アクセストークン: 15分、リフレッシュトークン: 7日 |
| アルゴリズム | RS256（非対称鍵） |

> **根拠**: [OWASP API2:2023 Broken Authentication](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/) — 短命のアクセストークン（15分以下）、標準プロトコル（OAuth 2.0）、強力なアルゴリズム（RS256）を使用する。

### 2.12 全文翻訳アクセス (Phase 3)

| 項目 | 仕様 |
|------|------|
| エンドポイント | GET /articles/{id}/full |
| 認証 | JWT必須 |
| 出力 | body_translated（翻訳全文）を含む完全な記事データ |

### 2.13 Newsletter配信 (Phase 3)

| 項目 | 仕様 |
|------|------|
| トリガー | n8nスケジュール（毎日/毎週） |
| 対象 | 登録ユーザーのメールアドレス |
| 内容 | ダイジェスト + 注目記事リンク |

---

## 3. API エンドポイント一覧

### Phase 1.0 — 実装済み

| Method | Path | Caller | Auth | Description |
|--------|------|--------|------|-------------|
| GET | `/health` | Any | なし | ヘルスチェック |
| GET | `/articles/check?url=` | n8n | なし | 重複チェック |
| POST | `/ingest` | n8n | API Key（1.2〜） | 本文抽出（保存しない） |
| POST | `/articles` | n8n | API Key（1.2〜） | 記事保存 |
| GET | `/articles` | Frontend | なし | 記事一覧（ページネーション対応） |
| GET | `/articles/{id}` | Frontend | なし | 記事詳細 |
| POST | `/digest` | n8n | API Key（1.2〜） | ダイジェスト保存 |
| GET | `/digest` | Frontend | なし | ダイジェスト一覧 |
| GET | `/digest/{date}` | Frontend | なし | 日付指定ダイジェスト |

### Phase 1.1 — 実装済み

| Method | Path | Caller | Auth | Description |
|--------|------|--------|------|-------------|
| GET | `/articles/stream` | Frontend | なし | SSEリアルタイム更新 |

### Phase 2 — 未実装

| Method | Path | Caller | Auth | Description |
|--------|------|--------|------|-------------|
| GET | `/sources` | Frontend | なし | ソース一覧 |
| POST | `/sources` | Admin | API Key | ソース追加 |
| PUT | `/sources/{id}` | Admin | API Key | ソース更新 |
| DELETE | `/sources/{id}` | Admin | API Key | ソース無効化 |
| GET | `/feed/rss` | Any | なし | RSS配信 |

### Phase 3 — 未実装

| Method | Path | Caller | Auth | Description |
|--------|------|--------|------|-------------|
| POST | `/auth/login` | User | なし | ログイン |
| POST | `/auth/refresh` | User | Refresh Token | トークン更新 |
| GET | `/articles/{id}/full` | User | JWT | 全文翻訳取得 |
| GET | `/users/me` | User | JWT | ユーザー情報 |

---

## 4. データベーススキーマ

### 4.1 articles テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 主キー |
| source_url | TEXT | UNIQUE | 元記事URL（重複チェック用。UNIQUE制約が自動的にインデックスを作成） |
| source_name | VARCHAR(100) | | ソース名（TechCrunch等） |
| title_original | TEXT | | 原文タイトル |
| title_ja | TEXT | | 日本語タイトル |
| body_original | TEXT | | 原文本文 |
| body_translated | TEXT | | 翻訳本文 |
| summary_ja | TEXT | | 日本語要約（公開用） |
| author | VARCHAR(200) | | 著者名 |
| published_at | TIMESTAMPTZ | IDX | 元記事の公開日時（UTC） |
| og_image_url | TEXT | | OGP画像URL |
| categories | TEXT[] | | カテゴリ配列（PostgreSQL ARRAY型） |
| metadata | JSONB | | その他メタデータ（PostgreSQL JSONB型） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時（UTC） |

### 4.2 digests テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 主キー |
| digest_date | DATE | UNIQUE, IDX | ダイジェスト対象日 |
| title | TEXT | | ダイジェストタイトル |
| content | TEXT | | ダイジェスト本文 |
| article_count | INTEGER | | 対象記事数 |
| article_ids | UUID[] | | 対象記事IDリスト（PostgreSQL ARRAY型） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時（UTC） |

### 4.3 sources テーブル（管理用）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 主キー |
| name | VARCHAR(100) | | ソース名 |
| rss_url | TEXT | UNIQUE | RSSフィードURL |
| site_url | TEXT | | サイトURL |
| category | VARCHAR(50) | | カテゴリ |
| is_active | BOOLEAN | DEFAULT TRUE | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時（UTC） |

### 4.4 users テーブル（Phase 3）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | 主キー |
| email | VARCHAR(254) | UNIQUE | メールアドレス |
| display_name | VARCHAR(100) | | 表示名 |
| oauth_provider | VARCHAR(20) | | OAuth プロバイダー（google, github） |
| oauth_id | VARCHAR(100) | | プロバイダー側のユーザーID |
| is_active | BOOLEAN | DEFAULT TRUE | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時（UTC） |

### 4.5 データベース規約

| 規約 | 仕様 | 根拠 |
|------|------|------|
| タイムゾーン | すべてのタイムスタンプは `DateTime(timezone=True)` (TIMESTAMPTZ) でUTC格納 | PostgreSQL推奨 |
| 日付フィルタ | 半開区間 `[start, start + 1day)` を使用 | `23:59:59` ではミリ秒のレコードを取り逃す |
| source_url インデックス | UNIQUE制約が自動作成 — 重複インデックスを追加しない | PostgreSQL仕様 |
| metadata属性名 | Python側は `metadata_` → DB側カラム名 `metadata` にマッピング | SQLAlchemy予約語回避 |
| PostgreSQL専用型 | `ARRAY(Text)`, `JSONB` を使用。SQLite互換性は不要 | テストもPostgreSQLで実行 |

---

## 5. 入力検証要件

### 5.1 基底モデル設定

`AppBaseModel`の`ConfigDict`に以下を設定する。

| 設定 | 値 | 目的 |
|------|-----|------|
| `from_attributes` | `True` | SQLAlchemy ORMオブジェクトからの変換 |
| `str_strip_whitespace` | `True` | 前後の空白を自動除去 |
| `str_max_length` | `65536` | グローバルな文字列長上限（防御的制約） |
| `extra` | `"forbid"` | 未知フィールドの拒否 |
| `validate_default` | `True` | デフォルト値もバリデーション |

> **根拠**: [Pydantic v2 ConfigDict](https://docs.pydantic.dev/latest/api/config/) — `extra="forbid"` は未知のフィールドを含むリクエストを拒否し、マスアサインメント攻撃を防止する。

### 5.2 ArticleCreate スキーマ制約

| フィールド | 型 | 制約 | 根拠 |
|------------|-----|------|------|
| source_url | `HttpUrl` | Pydantic HttpUrl型で自動検証（スキーム、ホスト、最大2083文字） | [Pydantic Network Types](https://docs.pydantic.dev/latest/api/networks/) |
| source_name | `str \| None` | `max_length=100` | DB VARCHAR(100)と一致 |
| title_original | `str \| None` | `max_length=500` | 実用的なタイトル長上限 |
| title_ja | `str \| None` | `max_length=500` | 同上 |
| body_original | `str \| None` | `max_length=200000` | 長文記事を許容しつつ上限を設定 |
| body_translated | `str \| None` | `max_length=200000` | 同上 |
| summary_ja | `str \| None` | `max_length=5000` | 要約は5000文字以内 |
| author | `str \| None` | `max_length=200` | DB VARCHAR(200)と一致 |
| og_image_url | `str \| None` | `max_length=2083` | URL長の標準上限 |
| categories | `list[str] \| None` | `max_length=20`（リスト）、各要素 `max_length=50` | カテゴリ数と名前長の制限 |
| metadata | `dict \| None` | — | `str_max_length`のグローバル制約で保護 |

### 5.3 DigestCreate スキーマ制約

| フィールド | 型 | 制約 |
|------------|-----|------|
| digest_date | `date` | 必須 |
| title | `str \| None` | `max_length=500` |
| content | `str \| None` | `max_length=100000` |
| article_count | `int \| None` | `ge=0, le=10000` |
| article_ids | `list[UUID] \| None` | `max_length=1000` |

### 5.4 IngestRequest スキーマ制約

| フィールド | 型 | 制約 | 状態 |
|------------|-----|------|------|
| url | `HttpUrl` | Pydantic HttpUrl型 | 実装済み ✅ |

> **根拠**: [OWASP API4:2023 Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/) — すべての入力パラメータとペイロードの最大サイズを定義し強制する。

---

## 6. セキュリティ要件

### 6.1 API Key認証（Phase 1.2）

| 項目 | 仕様 |
|------|------|
| 方式 | HTTPヘッダー `X-API-Key` |
| 実装 | FastAPI `APIKeyHeader` + `Security()` dependency |
| 対象 | すべてのPOST/PUT/DELETEエンドポイント |
| 非対象 | GET（公開読み取り）、GET /health |
| キー管理 | 環境変数 `API_KEYS` で設定（カンマ区切り） |
| エラー | 401 Unauthorized（キー不正・未提供時） |

> **根拠**: [FastAPI Security — APIKeyHeader](https://fastapi.tiangolo.com/reference/security/) — `Security()` は `Depends()` と同等に動作するが、OpenAPIセキュリティスキーム文書に統合され、Swagger UIにロックアイコンが表示される。

### 6.2 レート制限（Phase 1.2）

| エンドポイント | 制限値 | 根拠 |
|----------------|--------|------|
| POST /ingest | 10回/分 | n8nからの正常呼び出し頻度の2倍 |
| POST /articles | 30回/分 | バッチ処理時のバースト許容 |
| POST /digest | 5回/分 | 日次ダイジェストは1日1回 |
| GET /articles | 60回/分 | フロントエンド通常利用 |
| GET /articles/check | 100回/分 | n8nの重複チェック頻度 |
| GET /articles/stream | 同時接続20 | SSE接続数上限 |
| GET /articles/{id} | 60回/分 | フロントエンド通常利用 |

| 項目 | 仕様 |
|------|------|
| ライブラリ | slowapi 0.1.9 |
| キー関数 | IPアドレスベース（`get_remote_address`） |
| ストレージ | 単一インスタンス: インメモリ、複数レプリカ: Redis |
| レスポンス | 429 Too Many Requests + `Retry-After` ヘッダー |

> **根拠**: [OWASP API4:2023 Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/) — クライアントがAPIを呼び出せる頻度をエンドポイントごとにビジネスニーズに合わせて制限する。

### 6.3 セキュリティヘッダー（Phase 1.2）

| ヘッダー | 値 | 適用 |
|---------|-----|------|
| `X-Content-Type-Options` | `nosniff` | 全レスポンス |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | 全レスポンス |
| `Cache-Control` | `no-store` | APIレスポンス |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | APIレスポンス |
| `X-Frame-Options` | `DENY` | 全レスポンス |
| `Referrer-Policy` | `no-referrer` | 全レスポンス |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | 全レスポンス |
| `X-XSS-Protection` | `0` | 全レスポンス（非推奨ヘッダーの明示的無効化） |

> **根拠**: [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html), [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) — REST APIでも `X-Content-Type-Options: nosniff` と HSTS は必須。`X-XSS-Protection` は非推奨のため `0` に設定。

### 6.4 SSRF防御（Phase 1.0 実装済み ✅）

| 防御層 | 仕様 | 状態 |
|--------|------|------|
| スキーム検証 | http/httpsのみ許可 | ✅ |
| IPアドレス検証 | プライベートIP、ループバック、リンクローカル、マルチキャスト遮断 | ✅ |
| DNS解決タイムアウト | 5秒 | ✅ |
| DNSリバインド防止 | ホスト名を1回解決し、IPに直接接続 | ✅ |
| リダイレクト再検証 | 各リダイレクト先をIPレベルで再検証 | ✅ |
| 最大リダイレクト数 | 5回 | ✅ |

> **根拠**: [OWASP API7:2023 Server-Side Request Forgery](https://owasp.org/API-Security/editions/2023/en/0xa7-server-side-request-forgery/) — URLを検証し、許可リスト（拒否リストではなく）を使用し、HTTPリダイレクトを無効化または再検証する。

### 6.5 CORS設定

| 項目 | 仕様 |
|------|------|
| 許可オリジン | 環境変数 `CORS_ORIGINS` で設定 |
| 許可メソッド | `GET`, `POST` のみ |
| 許可ヘッダー | `Content-Type`, `Accept`, `X-API-Key` |
| クレデンシャル | `allow_credentials=False` |
| 本番検証 | `environment=production` 時に `localhost` を含むオリジンを拒否 |

### 6.6 エラーレスポンス方針

| 原則 | 仕様 |
|------|------|
| 内部情報の非漏洩 | スタックトレース、DB構造、内部パスをレスポンスに含めない |
| 一般エラー | `{"detail": "Internal server error"}` (500) |
| DB制約違反 | `IntegrityError` → 409、`SQLAlchemyError` → 500（詳細なし） |
| 入力エラー | Pydantic ValidationError → 422（フィールド名と制約のみ） |

### 6.7 データベースセキュリティ（Phase 1.2）

| 項目 | 仕様 | 根拠 |
|------|------|------|
| 認証方式 | `scram-sha-256`（`md5`ではない） | [PostgreSQL Password Auth](https://www.postgresql.org/docs/current/auth-password.html) |
| ユーザー分離 | マイグレーション用 `news_admin`、アプリ用 `news_app`（DELETE権限なし） | [PostgreSQL GRANT](https://www.postgresql.org/docs/current/sql-grant.html) |
| SSL/TLS | Phase 2でSSL接続を有効化 | [PostgreSQL SSL/TLS](https://www.postgresql.org/docs/16/ssl-tcp.html) |

### 6.8 フロントエンドセキュリティ

| 項目 | 仕様 | Phase |
|------|------|-------|
| `server-only` パッケージ | サーバー専用モジュール（`lib/api.ts`等）に `import "server-only"` を追加 | 1.2 |
| CSP | Next.js middleware/proxy.tsでnonce-based CSPヘッダーを設定 | 2 |
| `og_image_url` 検証 | API側のインジェスト時にURLフォーマットを検証 | 1.2 |
| CVE監視 | React/Next.jsのセキュリティアドバイザリを定期確認 | 継続 |

> **参考**: CVE-2025-55182 (React2Shell, CVSS 10.0) は React 19.2.1+ / Next.js 16.0.7+ で修正済み。現在のプロジェクト（React 19.2.3, Next.js 16.1.6）はパッチ適用済み。
> **出典**: [React Critical Security Vulnerability Advisory](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components), [Next.js Security Update](https://nextjs.org/blog/security-update-2025-12-11)

---

## 7. インフラストラクチャ要件

### 7.1 Docker イメージ

| 項目 | 仕様 | 根拠 |
|------|------|------|
| ベースイメージ | パッチバージョンまでピン留め（例: `python:3.12.8-slim`, `node:20.17-slim`, `postgres:16.6`） | [Docker Build Best Practices](https://docs.docker.com/build/building/best-practices/) |
| レジストリタグ | セマンティックバージョン（`v1.2.0`）を使用。`latest`は開発用のみ | イミュータブルなデプロイのため |
| 非rootユーザー | API: `appuser` (UID 10001)、Frontend: `node` ユーザー | [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) |
| ヘルスチェック | 各Dockerfileに `HEALTHCHECK` 命令を追加 | 自動回復のため |
| .dockerignore | `.env`, `.git`, `__pycache__`, `node_modules`, `docs/`, `tests/` を除外 | ビルドコンテキスト最適化・機密ファイル除外 |

### 7.2 Docker Compose（本番用）

| 項目 | 仕様 |
|------|------|
| ネットワーク | `frontend-net`（bridge）と `backend-net`（bridge, `internal: true`） |
| DBポート | 本番: ホストにエクスポーズしない。開発: `127.0.0.1:5432:5432` |
| APIポート | 本番: リバースプロキシ経由のみ。開発: `127.0.0.1:8100:8100` |
| リソース制限 | API: CPU 1.0 / Memory 512M、Frontend: CPU 0.5 / Memory 256M、DB: CPU 1.0 / Memory 1G |
| 再起動ポリシー | `on-failure` (max_attempts: 3, delay: 5s) |
| ケーパビリティ | `cap_drop: [ALL]` でLinuxケーパビリティをすべて削除 |

### 7.3 環境変数

#### API (news-api)

| 変数 | 説明 | 例 | 必須 |
|------|------|-----|------|
| DATABASE_URL | PostgreSQL接続文字列 | `postgresql+asyncpg://news_app:pass@news-db:5432/news_curator` | Yes |
| ENVIRONMENT | 環境識別子 | `development` / `production` | Yes |
| API_KEYS | 許可するAPIキー（カンマ区切り） | `key1,key2` | Yes（Phase 1.2〜） |
| CORS_ORIGINS | CORSオリジン（JSON配列） | `["https://news.example.com"]` | Yes |

#### Frontend (news-frontend)

| 変数 | 説明 | 例 | 必須 |
|------|------|-----|------|
| API_URL | APIエンドポイント（サーバーサイド、非公開） | `http://news-api:8100` | Yes |

> **注意**: `NEXT_PUBLIC_` プレフィックスは使用しない。すべてのデータフェッチはServer Componentでサーバーサイドのみ実行される。

#### Database (news-db)

| 変数 | 説明 | 例 | 必須 |
|------|------|-----|------|
| POSTGRES_USER | DBユーザー | `news` | Yes |
| POSTGRES_PASSWORD | DBパスワード | `$(openssl rand -base64 16)` | Yes |
| POSTGRES_DB | DB名 | `news_curator` | Yes |
| POSTGRES_HOST_AUTH_METHOD | 認証方式 | `scram-sha-256` | Yes |
| POSTGRES_INITDB_ARGS | 初期化引数 | `--auth-host=scram-sha-256` | Yes |

---

## 8. テスト戦略

### 8.1 テスト方針

テストピラミッド（[Martin Fowler, Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)）に基づき、以下の比率を目標とする。

#### バックエンド（FastAPI）

| テスト種別 | 目標比率 | 対象 | ツール |
|-----------|---------|------|--------|
| 単体テスト | 60% | サービス層、スキーマ、ユーティリティ | pytest + pytest-asyncio 1.3.0 |
| 統合テスト | 30% | APIエンドポイント（実PostgreSQL） | httpx 0.28+ + testcontainers 4.14.0 |
| E2Eテスト | 10% | n8n連携シナリオ | pytest |

#### フロントエンド（Next.js 16）

| テスト種別 | 対象 | ツール | 備考 |
|-----------|------|--------|------|
| 単体テスト | ユーティリティ関数、同期コンポーネント | Vitest + React Testing Library | async Server Componentは対象外 |
| E2Eテスト | 全ページ（Server Component含む） | Playwright | async Server Componentのテストに必須 |

> **根拠**: [Next.js Testing Guide](https://nextjs.org/docs/app/guides/testing) — Vitestはasync Server Componentsをサポートしない。async Server ComponentのテストにはE2Eテストを推奨。

### 8.2 バックエンドテスト環境

| 項目 | 仕様 | 根拠 |
|------|------|------|
| DB | PostgreSQL 16 via testcontainers（SQLiteは不使用） | ARRAY/JSONB型の互換性 |
| コンテナスコープ | `session`（テストセッション全体で1コンテナ） | 起動コスト削減 |
| テーブルスコープ | `function`（テスト関数ごとに`create_all`/`drop_all`） | テスト間の独立性 |
| 接続プール | `NullPool`（テスト用） | 接続リークの防止 |
| セッション注入 | `app.dependency_overrides[get_session]` | FastAPI DI機構 |
| 非同期設定 | `asyncio_mode = "auto"`, `asyncio_default_fixture_loop_scope = "session"` | pytest-asyncio 1.3.0 |

> **根拠**: [testcontainers Best Practices](https://www.docker.com/blog/testcontainers-best-practices/) — コンテナはセッションスコープ、データは関数スコープとし、テスト間のデータ分離とコスト最適化を両立する。

### 8.3 テストカバレッジ要件

| テスト対象 | 現状 | 目標 | Phase |
|-----------|------|------|-------|
| routers/articles | 9テスト ✅ | 12テスト（エラーケース追加） | 1.2 |
| routers/digest | 6テスト ✅ | 8テスト（エラーケース追加） | 1.2 |
| routers/health | 1テスト ✅ | 2テスト（DB障害時） | 1.2 |
| routers/ingest | 7テスト ✅ | 9テスト（認証テスト追加） | 1.2 |
| routers/sse | 6テスト ✅ | 6テスト | — |
| services/article_service | **なし** | 6テスト（各関数の正常・異常系） | 1.2 |
| services/digest_service | **なし** | 6テスト（各関数の正常・異常系） | 1.2 |
| services/article_monitor | 1テスト（部分的） | 4テスト（ポーリング、ブロードキャスト、エラー回復） | 1.2 |
| services/url_validator | 8テスト ✅ | 8テスト | — |
| **全体カバレッジ目標** | — | **80%以上** | 1.2 |

### 8.4 セキュリティテスト

| ツール | 目的 | 実行タイミング | Phase |
|--------|------|---------------|-------|
| Semgrep | SAST（FastAPIフレームワーク対応） | PR毎（CI） | 1.2 |
| Bandit 1.9.x | SAST（Python汎用） | PR毎（CI） | 1.2 |
| pip-audit 2.10.x | 依存パッケージ脆弱性スキャン | PR毎 + 日次スケジュール | 1.2 |
| Trivy | Dockerイメージ脆弱性スキャン | イメージビルド時（CI） | 1.2 |
| OWASP ZAP 2.17.x | DAST（APIスキャン） | リリース前 | 2 |

> **根拠**: [Semgrep Framework-Native Analysis](https://semgrep.dev/blog/2024/redefining-security-coverage-for-python-with-framework-native-analysis/) — SemgrepはFastAPIのルーティング、DI、リクエスト処理パターンを理解し、フレームワーク固有のデータフロー追跡が可能。

### 8.5 CI/CDパイプライン（テスト関連）

```
PR作成/更新 → Lint → Type Check → SAST (Semgrep + Bandit)
           → pip-audit → Unit Tests → Integration Tests
           → Docker Build → Trivy Scan → 結果レポート
```

---

## 9. 非機能要件

### 9.1 技術スタック

| レイヤー | 技術 | バージョン | 備考 |
|----------|------|-----------|------|
| Language | Python | 3.12 | |
| Framework | FastAPI | >=0.128.0,<0.130.0 | |
| Validation | Pydantic | >=2.12.0,<3.0.0 | v2 ConfigDict, Field制約 |
| Settings | pydantic-settings | >=2.12.0 | BaseSettings, .env読み込み |
| ORM | SQLAlchemy | >=2.0.46,<2.1.0 | async, Mapped[] + mapped_column() |
| Migration | Alembic | >=1.18.0,<1.19.0 | |
| DB Driver | asyncpg | >=0.31.0 | |
| ASGI Server | uvicorn | >=0.40.0 | |
| 本文抽出 | trafilatura | >=2.0.0 | bare_extraction()→Document object |
| SSE | sse-starlette | >=3.2.0,<4.0.0 | |
| Rate Limiting | slowapi | 0.1.9 | Phase 1.2 |
| DB | PostgreSQL | 16 | |
| Frontend | Next.js | 16.1.x | App Router, Server Components |
| React | React | 19.2.x | >= 19.2.1 (CVE-2025-55182修正済み) |
| Container | Docker Compose | v2 | |
| テスト（API） | pytest | 9.x | |
| テスト（非同期） | pytest-asyncio | 1.3.0 | asyncio_mode="auto" |
| テスト（DB） | testcontainers | 4.14.0 | postgres module |
| テスト（HTTP） | httpx | >=0.28.1 | ASGITransport使用 |
| テスト（Frontend） | Vitest | latest | 同期コンポーネント |
| テスト（E2E） | Playwright | latest | async Server Components |
| SAST | Semgrep + Bandit | latest / 1.9.x | |
| 依存スキャン | pip-audit | 2.10.x | |
| イメージスキャン | Trivy | latest | |

### 9.2 ポート割り当て

| サービス | ポート | 本番時の公開 |
|----------|--------|-------------|
| news-api | 8100 | リバースプロキシ経由のみ |
| news-frontend | 3100 (→3000) | 公開 |
| news-db | 5432 | 非公開（internal network） |

### 9.3 接続プール設定

| パラメータ | 値 | 根拠 |
|-----------|-----|------|
| `pool_size` | 20 | ASGIアプリの中程度の同時接続 |
| `max_overflow` | 10 | 合計最大30接続 |
| `pool_pre_ping` | `True` | アイドル接続の失効検出 |
| `pool_timeout` | 30 | プール取得待ちの上限秒数 |
| `pool_recycle` | 1800 | 30分で接続をリサイクル |

> **根拠**: [SQLAlchemy Connection Pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html) — `pool_pre_ping=True` は各チェックアウト前に軽量チェックを実行し、`ConnectionResetError` を防止する。`pool_recycle` はロードバランサー/プロキシ経由の接続に推奨。

---

## 10. 著作権対応

| 公開範囲 | 提供内容 | Phase |
|----------|----------|-------|
| 公開API | 要約（summary_ja） + 元記事リンク（source_url）のみ | 1 |
| 認証付きAPI | 全文翻訳（body_translated） | 3 |
| 内部保存 | body_original, body_translated は保存するが公開レスポンスから除外 | 1 |

> **制約**: `ArticleListItem` および `ArticleDetail` スキーマは `body_original`、`body_translated` フィールドを含まない。Phase 3 の `ArticleFull` スキーマでのみ返却する。

---

## 11. フェーズ計画

### Phase 1.0 — MVP（実装済み ✅）

- [x] FastAPI + PostgreSQL でSlim API実装
- [x] Docker Compose構成（3コンテナ）
- [x] Alembicマイグレーション
- [x] APIエンドポイントテスト（統合テスト）
- [x] Next.js 16 フロントエンド（Server Components）
- [x] SSRF防御（url_validator, safe_fetch）
- [x] SSEリアルタイム更新

### Phase 1.1 — UI改善（実装済み ✅）

- [x] ヒーローセクション付き記事一覧リデザイン
- [x] レスポンシブグリッドレイアウト
- [x] 無限スクロール

### Phase 1.2 — セキュリティ強化・品質向上（次期実装）

**セキュリティ強化:**
- [ ] API Key認証（write endpoints: POST /ingest, POST /articles, POST /digest）
- [ ] レート制限ミドルウェア（slowapi）
- [ ] セキュリティヘッダーミドルウェア
- [ ] Pydantic入力検証強化（Field制約、`extra="forbid"`、`str_max_length`）
- [ ] CORS本番検証（localhost拒否）
- [ ] エラーハンドリング改善（`SQLAlchemyError`キャッチ、情報漏洩防止）
- [ ] `server-only`パッケージ導入

**インフラ強化:**
- [ ] Dockerネットワーク分離（`backend-net` internal）
- [ ] DBポートのホストエクスポーズ削除
- [ ] ベースイメージのパッチバージョンピン留め
- [ ] .dockerignore作成
- [ ] リソース制限・再起動ポリシー設定
- [ ] PostgreSQL `scram-sha-256`認証
- [ ] DBユーザー分離（admin / app）

**品質向上:**
- [ ] サービス層の単体テスト追加（article_service, digest_service, article_monitor）
- [ ] エラーバウンダリ（error.tsx）追加
- [ ] アクセシビリティ改善（aria-label, aria-live）
- [ ] CI/CDにSAST・依存スキャン追加

### Phase 2 — 公開版

- [ ] ソース管理エンドポイント（CRUD）
- [ ] カテゴリ・タグ分類
- [ ] RSS配信（GET /feed/rss）
- [ ] ソースを10〜15に拡大
- [ ] フロントエンドCSP設定
- [ ] PostgreSQL SSL/TLS接続
- [ ] OWASP ZAP DATSスキャン導入
- [ ] フロントエンドE2Eテスト（Playwright）
- [ ] n8n Workflow A/B（別途実装）

### Phase 3 — 収益化

- [ ] JWT認証（OAuth 2.0: Google, GitHub）
- [ ] 全文翻訳エンドポイント（GET /articles/{id}/full）
- [ ] Row Level Security (RLS)
- [ ] ユーザー管理
- [ ] Stripe連携
- [ ] Newsletter配信
- [ ] 独自分析・コメント追加

---

## 12. Phase 1.2 スコープ外

以下はPhase 1.2では実装しない:

- JWT認証・OAuth（Phase 3）
- ユーザー管理・ユーザーテーブル（Phase 3）
- ソース管理エンドポイント（Phase 2）
- RSS配信（Phase 2）
- Newsletter配信（Phase 3）
- Stripe連携（Phase 3）
- PostgreSQL SSL/TLS（Phase 2）
- OWASP ZAP DATSスキャン（Phase 2）
- n8nワークフロー構築（別管理）
- Ollama設定（別管理）

---

## 13. 初期RSSソース（参考）

Phase 1 検証用として大手テック系を想定:

- TechCrunch
- The Verge
- Ars Technica

※ 実際のRSS URLはn8n側で設定

---

## 14. Docker Compose構成

### 14.1 サービス一覧

| サービス | 状態 | 説明 |
|----------|------|------|
| news-api | 実装済み | FastAPI。本文抽出・保存・配信 |
| news-frontend | 実装済み | Next.js 16 Server Components。公開サイト |
| news-db | 実装済み | PostgreSQL 16 |
| n8n | EXISTING | ワークフロー管理（別管理） |
| ollama | EXISTING | LLM（Mac Studio上で稼働） |

### 14.2 ネットワーク構成（Phase 1.2）

| ネットワーク | ドライバー | internal | 接続サービス |
|-------------|-----------|----------|-------------|
| frontend-net | bridge | false | news-frontend, news-api |
| backend-net | bridge | true | news-api, news-db |

### 14.3 ボリューム

| ボリューム | マウント先 | 用途 |
|------------|-----------|------|
| postgres_data | /var/lib/postgresql/data | DBデータ永続化 |

---

## 15. ディレクトリ構成

```
tech-news-curator/
├── api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPIアプリ（lifespan, ミドルウェア）
│   │   ├── config.py          # Settings（環境変数, API Key）
│   │   ├── database.py        # AsyncEngine, SessionFactory
│   │   ├── models/            # SQLAlchemy 2.0 ORMモデル
│   │   ├── schemas/           # Pydantic v2 スキーマ（Field制約付き）
│   │   ├── routers/           # FastAPIルーター
│   │   └── services/          # ビジネスロジック（SSRF防御含む）
│   ├── alembic/               # DBマイグレーション
│   ├── tests/                 # pytest（単体 + 統合テスト）
│   ├── Dockerfile
│   ├── .dockerignore          # Phase 1.2で追加
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js 16 App Router（Server Components）
│   │   ├── components/        # Reactコンポーネント
│   │   └── lib/               # API クライアント, ユーティリティ
│   ├── e2e/                   # Playwright E2Eテスト（Phase 2）
│   ├── Dockerfile
│   ├── .dockerignore          # Phase 1.2で追加
│   └── package.json
├── docker-compose.yml         # 本番構成
├── docker-compose.dev.yml     # 開発構成
├── Makefile
├── .env.example               # 環境変数テンプレート
├── .gitignore                 # .env を含む
├── docs/
│   ├── REQUIREMENTS.md        # v1.0（アーカイブ）
│   └── REQUIREMENTS-v2.0.md   # 本仕様書
└── README.md
```

---

## 16. スケジュール（n8n側で設定）

| 頻度 | ワークフロー | 処理内容 |
|------|-------------|----------|
| 2時間おき | Workflow A | RSS巡回→重複チェック→本文取得→翻訳→要約→保存 |
| 毎日 23:00 JST | Workflow B | 当日記事取得→ダイジェスト生成→保存 |

---

## Appendix A: OWASP API Security Top 10 (2023) 対応表

本プロジェクトの各OWASPリスクへの対応状況。

| # | リスク | 対応策 | Phase | 状態 |
|---|--------|--------|-------|------|
| API1 | Broken Object Level Authorization (BOLA) | UUIDを主キーに使用。Phase 3でRLS導入 | 1.0/3 | 部分 |
| API2 | Broken Authentication | API Key認証（1.2）、JWT（3） | 1.2/3 | 未 |
| API3 | Broken Object Property Level Authorization | レスポンススキーマでbody_original等を除外 | 1.0 | ✅ |
| API4 | Unrestricted Resource Consumption | レート制限、入力サイズ制約、ページネーション | 1.2 | 未 |
| API5 | Broken Function Level Authorization (BFLA) | write endpointにAPI Key認証 | 1.2 | 未 |
| API6 | Unrestricted Access to Sensitive Business Flows | レート制限 + API Key | 1.2 | 未 |
| API7 | Server-Side Request Forgery (SSRF) | 包括的SSRF防御（DNS rebind防止含む） | 1.0 | ✅ |
| API8 | Security Misconfiguration | セキュリティヘッダー、CORS検証、DB認証強化 | 1.2 | 未 |
| API9 | Improper Inventory Management | 単一バージョンAPI、不要エンドポイントなし | 1.0 | ✅ |
| API10 | Unsafe Consumption of APIs | trafilaturaの出力サニタイズ | 1.0 | ✅ |

> **出典**: [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)

---

## Appendix B: 参考文献

### セキュリティ

| 文書 | URL |
|------|-----|
| OWASP API Security Top 10 (2023) | https://owasp.org/API-Security/editions/2023/en/0x11-t10/ |
| OWASP REST Security Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html |
| OWASP HTTP Headers Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html |
| OWASP Docker Security Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html |
| FastAPI Security Reference | https://fastapi.tiangolo.com/reference/security/ |
| React CVE-2025-55182 Advisory | https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components |
| Next.js Security Update 2025-12-11 | https://nextjs.org/blog/security-update-2025-12-11 |

### フレームワーク・ライブラリ

| 文書 | URL |
|------|-----|
| Pydantic v2 Fields | https://docs.pydantic.dev/latest/concepts/fields/ |
| Pydantic v2 ConfigDict | https://docs.pydantic.dev/latest/api/config/ |
| SQLAlchemy 2.0 Async I/O | https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html |
| SQLAlchemy 2.0 Connection Pooling | https://docs.sqlalchemy.org/en/20/core/pooling.html |
| PostgreSQL 16 SSL/TLS | https://www.postgresql.org/docs/16/ssl-tcp.html |
| PostgreSQL GRANT | https://www.postgresql.org/docs/current/sql-grant.html |
| Next.js Testing Guide | https://nextjs.org/docs/app/guides/testing |
| slowapi Documentation | https://slowapi.readthedocs.io/ |

### テスト

| 文書 | URL |
|------|-----|
| Martin Fowler — Practical Test Pyramid | https://martinfowler.com/articles/practical-test-pyramid.html |
| Google Testing Blog — SMURF | https://testing.googleblog.com/2024/10/smurf-beyond-test-pyramid.html |
| pytest-asyncio Configuration | https://pytest-asyncio.readthedocs.io/en/latest/reference/configuration.html |
| testcontainers Best Practices | https://www.docker.com/blog/testcontainers-best-practices/ |
| FastAPI Async Tests | https://fastapi.tiangolo.com/advanced/async-tests/ |
| Semgrep FastAPI Native Analysis | https://semgrep.dev/blog/2024/redefining-security-coverage-for-python-with-framework-native-analysis/ |

### Docker

| 文書 | URL |
|------|-----|
| Docker Build Best Practices | https://docs.docker.com/build/building/best-practices/ |
| Docker Resource Constraints | https://docs.docker.com/engine/containers/resource_constraints/ |
| Docker Compose Deploy | https://docs.docker.com/reference/compose-file/deploy/ |
