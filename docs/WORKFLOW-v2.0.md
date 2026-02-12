# Phase 1.2 実装ワークフロー計画

> **Version**: 2.0
> **Date**: 2026-02-11
> **Base**: DESIGN-v2.0.md §7 実装順序
> **Status**: 承認待ち

---

## 1. ワークフロー概要

Phase 1.2 の実装を 8 ステップに分割し、各ステップを独立したフィーチャーブランチで実施する。依存関係のないステップは並行実施可能。

### 1.1 依存関係グラフ

```
Step 1 (入力検証) ──┬──→ Step 2 (API Key認証) ──→ Step 3 (レート制限)
                    │                                      │
                    ├──→ Step 4 (セキュリティヘッダー)       │
                    │                                      │
                    └──→ Step 6 (サービス層テスト) ←────────┘
                         ※ Step 2 の認証テストも前提

Step 5 (インフラ強化) ──→ 独立（並行実施可能）

Step 7 (フロントエンド改善) ──→ 独立（並行実施可能）

Step 8 (CI/CD) ──→ Step 1〜7 完了後
```

### 1.2 クリティカルパス

```
Step 1 → Step 2 → Step 3 → Step 6 → Step 8
```

### 1.3 並行実施可能な組み合わせ

| グループ | ステップ | 理由 |
|---------|---------|------|
| A | Step 1 | 最初に実施（他の前提） |
| B | Step 2, Step 4, Step 5, Step 7 | Step 1 完了後、相互依存なし |
| C | Step 3 | Step 2 完了後 |
| D | Step 6 | Step 1, 2 完了後 |
| E | Step 8 | Step 1〜7 全完了後 |

---

## 2. 各ステップ詳細

---

### Step 1: Pydantic 入力検証強化

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-input-validation` |
| 依存関係 | なし |
| 設計書参照 | §3.4 |
| 推定変更ファイル数 | 4 |

#### 2.1.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 1-1 | `AppBaseModel` の `ConfigDict` に `str_max_length=65536`, `extra="forbid"`, `validate_default=True` を追加 | `api/app/schemas/__init__.py` | §3.4.1 |
| 1-2 | `ArticleCreate` の全フィールドに `Field()` 制約を追加。`source_url` を `HttpUrl` 型に変更 | `api/app/schemas/article.py` | §3.4.2 |
| 1-3 | `DigestCreate` の全フィールドに `Field()` 制約を追加 | `api/app/schemas/digest.py` | §3.4.3 |
| 1-4 | `article_service.create_article()` で `str(data.source_url)` 変換を追加 | `api/app/services/article_service.py` | §3.4.2 |

#### 2.1.2 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-1-1 | 既存テストがすべてパスする | `make test` |
| CP-1-2 | `extra="forbid"` により未知フィールドが 422 で拒否される | テスト実行で確認 |
| CP-1-3 | `HttpUrl` により無効な URL が 422 で拒否される | テスト実行で確認 |
| CP-1-4 | `source_url` が DB に `str` として保存される | 既存の `test_create_article` テストで確認 |

#### 2.1.3 リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| `extra="forbid"` が既存テストの余分なフィールドを拒否 | テスト失敗 | テストデータの確認・修正 |
| `HttpUrl` → `str` 変換漏れ | DB 保存エラー | `create_article()` での変換を確実に実施 |

---

### Step 2: API Key 認証

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-api-key-auth` |
| 依存関係 | Step 1（スキーマ変更後） |
| 設計書参照 | §3.1, §3.5, §5.2 |
| 推定変更ファイル数 | 9 |

#### 2.2.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 2-1 | `Settings` に `api_keys: list[str]` 追加。`SettingsConfigDict` に `env_parse_delimiter=","` 追加 | `api/app/config.py` | §3.1.2 |
| 2-2 | `validate_production()` に `api_keys` 空チェックと `cors_origins` localhost チェックを追加 | `api/app/config.py` | §3.1.2, §3.5.2 |
| 2-3 | `api/app/dependencies.py` 新規作成。`APIKeyHeader` + `verify_api_key()` 実装 | `api/app/dependencies.py` (新規) | §3.1.3 |
| 2-4 | `POST /ingest` に `verify_api_key` dependency 追加 | `api/app/routers/ingest.py` | §3.1.4 |
| 2-5 | `POST /articles` に `verify_api_key` dependency 追加 | `api/app/routers/articles.py` | §3.1.4 |
| 2-6 | `POST /digest` に `verify_api_key` dependency 追加 | `api/app/routers/digest.py` | §3.1.4 |
| 2-7 | CORS `allow_headers` に `X-API-Key` 追加 | `api/app/main.py` | §3.5.3 |
| 2-8 | `conftest.py` にテスト用 API キーと Settings オーバーライド追加 | `api/tests/conftest.py` | §3.1.5 |
| 2-9 | 既存 POST テストに `X-API-Key` ヘッダー追加。認証テスト（401 テスト）追加 | `api/tests/test_*.py` | §5.2 |
| 2-10 | `.env.example` に `API_KEYS` 追加。`CORS_ORIGINS` をカンマ区切り形式に変更 | `.env.example` | §3.1.2, §4.6 |

#### 2.2.2 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-2-1 | API キーなしの POST で 401 が返る | `make test`（認証テストで確認） |
| CP-2-2 | 有効な API キーの POST で正常レスポンス | `make test`（既存テスト + ヘッダー追加で確認） |
| CP-2-3 | GET エンドポイントは API キー不要で正常動作 | `make test`（既存 GET テストで確認） |
| CP-2-4 | `env_parse_delimiter` でカンマ区切りが正しくパースされる | テスト内の Settings オーバーライドで確認 |
| CP-2-5 | Swagger UI にロックアイコンが表示される | `make dev` → ブラウザで `/docs` 確認 |

#### 2.2.3 リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| `env_parse_delimiter` が既存の `cors_origins` パースに影響 | CORS 設定破壊 | `.env.example` の `CORS_ORIGINS` をカンマ区切りに変更 |
| テストの POST リクエストにヘッダー追加漏れ | テスト失敗 | 全 POST テストを網羅的に確認 |

---

### Step 3: レート制限

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-rate-limiting` |
| 依存関係 | Step 2（認証導入後） |
| 設計書参照 | §3.2 |
| 推定変更ファイル数 | 7 |

#### 2.3.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 3-1 | `slowapi==0.1.9` を追加 | `api/requirements.txt` | §2.1 |
| 3-2 | `Limiter` インスタンス作成、`app.state.limiter` 設定、`RateLimitExceeded` ハンドラ登録、`SlowAPIMiddleware` 追加 | `api/app/main.py` | §3.2.2 |
| 3-3 | 全エンドポイントに `@limiter.limit()` デコレータと `request: Request` 引数を追加 | `api/app/routers/articles.py`, `digest.py`, `ingest.py` | §3.2.3 |
| 3-4 | `SSEBroker.subscribe()` に接続数上限チェック（max 20）を追加 | `api/app/services/sse_broker.py` | §3.2.4 |
| 3-5 | `stream_articles` で `ConnectionLimitExceeded` をキャッチし 503 を返す | `api/app/routers/sse.py` | §3.2.4 |
| 3-6 | `conftest.py` の `client` fixture で `limiter.enabled = False` を設定 | `api/tests/conftest.py` | §3.2.x |

#### 2.3.2 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-3-1 | テスト環境でレート制限が無効化されている | `make test`（全テストパス） |
| CP-3-2 | ミドルウェア追加順序が正しい | `main.py` のコードレビューで確認 |
| CP-3-3 | SSE 接続制限が機能する | 手動検証（21 接続目で 503） |

#### 2.3.3 手動検証

```bash
# レート制限の動作確認（開発環境）
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8100/ingest \
    -H "X-API-Key: <test-key>" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com"}'
done
# 11回目で 429 が返ることを確認
```

---

### Step 4: セキュリティヘッダー・CORS・エラーハンドリング

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-security-headers` |
| 依存関係 | Step 1（スキーマ変更後） |
| 設計書参照 | §3.3, §3.5, §3.6 |
| 推定変更ファイル数 | 2 |

#### 2.4.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 4-1 | `SecurityHeadersMiddleware` クラス作成。8 ヘッダー付与。CSP パス別分岐実装 | `api/app/middleware.py` (新規) | §3.3.2 |
| 4-2 | `SecurityHeadersMiddleware` を `main.py` に追加。本番環境で `docs_url=None, redoc_url=None` 設定 | `api/app/main.py` | §3.3.3 |
| 4-3 | `SQLAlchemyError` グローバル例外ハンドラ追加 | `api/app/main.py` | §3.6.2 |
| 4-4 | 汎用 `Exception` グローバル例外ハンドラ追加 | `api/app/main.py` | §3.6.3 |

#### 2.4.2 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-4-1 | セキュリティヘッダーが全レスポンスに付与される | `curl -I http://localhost:8100/health` |
| CP-4-2 | `/docs` パスで CSP がスキップされる（開発環境） | ブラウザで Swagger UI が正常表示されることを確認 |
| CP-4-3 | 例外ハンドラがスタックトレースを隠蔽する | テストで意図的にエラーを発生させ、レスポンスに内部情報がないことを確認 |
| CP-4-4 | 既存テストが全てパスする | `make test` |

---

### Step 5: インフラ強化

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-infra-hardening` |
| 依存関係 | なし（独立して並行実施可能） |
| 設計書参照 | §4 |
| 推定変更ファイル数 | 9 |

#### 2.5.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 5-1 | ネットワーク定義追加（`frontend-net`, `backend-net`）。各サービスにネットワーク割り当て | `docker-compose.yml` | §4.1.2 |
| 5-2 | DB ポート公開削除（本番）。API ポートを `127.0.0.1` バインドに変更 | `docker-compose.yml` | §4.1.3, §4.1.4 |
| 5-3 | DB ポートを `127.0.0.1:5432:5432` で追加（開発環境） | `docker-compose.dev.yml` | §4.1.3 |
| 5-4 | ベースイメージをパッチバージョンにピン留め（`python:3.12.12-slim`, `node:20.20.0-slim`, `postgres:16.12`） | `api/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` | §4.2 |
| 5-5 | API Dockerfile に `HEALTHCHECK` と `EXPOSE 8100` 追加 | `api/Dockerfile` | §4.2.1 |
| 5-6 | Frontend Dockerfile に `HEALTHCHECK` 追加 | `frontend/Dockerfile` | §4.2.2 |
| 5-7 | `.dockerignore` ファイル作成（API, Frontend） | `api/.dockerignore`, `frontend/.dockerignore` (新規) | §4.3 |
| 5-8 | 全サービスに `cpus`, `mem_limit`, `restart`, `cap_drop: [ALL]` 追加 | `docker-compose.yml` | §4.4 |
| 5-9 | `POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"` 追加 | `docker-compose.yml` | §4.5.1 |
| 5-10 | DB ユーザー分離スクリプト作成。`docker-entrypoint-initdb.d` にマウント | `db/init/01-create-app-user.sql` (新規), `docker-compose.yml` | §4.5.2 |
| 5-11 | `Settings` に `database_admin_url` 追加。Alembic 設定で `DATABASE_ADMIN_URL` を参照 | `api/app/config.py`, `api/alembic/env.py` | §4.5.2 |
| 5-12 | `.env.example` に `NEWS_APP_PASSWORD`, `ENVIRONMENT` 追加 | `.env.example` | §4.6 |

#### 2.5.2 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-5-1 | `docker compose up` で全サービスが起動する | `make up` → `docker compose ps` |
| CP-5-2 | frontend から DB に直接接続できない | `docker compose exec news-frontend ping news-db` → タイムアウト |
| CP-5-3 | DB ポートがホストに公開されていない（本番構成） | `docker compose port news-db 5432` → 結果なし |
| CP-5-4 | `news_app` ユーザーで DELETE が拒否される | DB 接続して `DELETE FROM articles;` → 権限エラー |
| CP-5-5 | HEALTHCHECK が正常動作する | `docker inspect` で health status 確認 |
| CP-5-6 | Alembic マイグレーションが `news` ユーザーで実行できる | `make migrate-up` |

#### 2.5.3 リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| `internal: true` ネットワークで API が外部アクセス不可 | フロントエンドと API の通信断 | API は `frontend-net` と `backend-net` の両方に接続 |
| DB 初期化スクリプトが既存ボリュームで再実行されない | `news_app` ユーザーが作成されない | 初回以外はボリューム削除後に再作成、または手動で SQL 実行 |
| `cap_drop: [ALL]` で必要なケーパビリティが欠如 | サービス起動失敗 | 起動テストで確認し、必要に応じて `cap_add` で最小限追加 |

---

### Step 6: サービス層テスト追加

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-service-tests` |
| 依存関係 | Step 1（スキーマ変更）、Step 2（認証テスト） |
| 設計書参照 | §5.1, §5.2 |
| 推定変更ファイル数 | 3（新規） |

#### 2.6.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 6-1 | `article_service` の 6 テストケース作成 | `api/tests/test_article_service.py` (新規) | §5.1.2 |
| 6-2 | `digest_service` の 6 テストケース作成 | `api/tests/test_digest_service.py` (新規) | §5.1.3 |
| 6-3 | `article_monitor` の 3 テストケース追加 | `api/tests/test_article_monitor.py` (新規) | §5.1.4 |

#### 2.6.2 テストケース詳細

**`test_article_service.py`** (6 テスト):

| テスト名 | 検証内容 |
|---------|---------|
| `test_check_article_exists_true` | 存在する URL → `True` |
| `test_check_article_exists_false` | 存在しない URL → `False` |
| `test_create_article_success` | 正常作成、返り値の型と内容 |
| `test_create_article_duplicate_url` | 重複 URL → `IntegrityError` |
| `test_get_articles_pagination` | `total`, `offset`, `limit` の正確性 |
| `test_get_articles_date_filter` | 半開区間 `[start, start+1day)` の正確性 |

**`test_digest_service.py`** (6 テスト):

| テスト名 | 検証内容 |
|---------|---------|
| `test_create_digest_success` | 正常作成 |
| `test_create_digest_duplicate_date` | 重複日付 → `IntegrityError` |
| `test_get_digests_pagination` | ページネーションの正確性 |
| `test_get_digests_ordering` | `digest_date` 降順 |
| `test_get_digest_by_date_found` | 存在する日付 → `Digest` |
| `test_get_digest_by_date_not_found` | 存在しない日付 → `None` |

**`test_article_monitor.py`** (3 テスト追加):

| テスト名 | 検証内容 |
|---------|---------|
| `test_monitor_broadcasts_new_articles` | 新規記事 → SSE ブロードキャスト |
| `test_monitor_skips_when_no_clients` | クライアント 0 → DB クエリスキップ |
| `test_monitor_recovers_from_db_error` | DB エラー後もポーリング継続 |

#### 2.6.3 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-6-1 | 新規テスト 15 件がすべてパスする | `make test` |
| CP-6-2 | 既存テストに影響がない | `make test`（全テスト合計 59 件パス） |
| CP-6-3 | サービス層テストが DB セッションを直接注入している（HTTP クライアント不使用） | コードレビュー |

---

### Step 7: フロントエンド改善

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-frontend-improvements` |
| 依存関係 | なし（独立して並行実施可能） |
| 設計書参照 | §3.7, §5.3, §5.4 |
| 推定変更ファイル数 | 7 |

#### 2.7.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 7-1 | `server-only` パッケージをインストール | `frontend/package.json` | §3.7.2 |
| 7-2 | `import "server-only"` を追加 | `frontend/src/lib/api.ts` | §3.7.2 |
| 7-3 | ルートエラーバウンダリ作成（`"use client"`, `Error` + `reset` props） | `frontend/src/app/error.tsx` (新規) | §5.3.2 |
| 7-4 | `Header.tsx` に `aria-label="メインナビゲーション"` 追加 | `frontend/src/components/Header.tsx` | §5.4.1 |
| 7-5 | `ArticleListLive.tsx` に `aria-live="polite"` 追加 | `frontend/src/components/ArticleListLive.tsx` | §5.4.1 |
| 7-6 | `ArticleCard.tsx` に `aria-label` 追加 | `frontend/src/components/ArticleCard.tsx` | §5.4.1 |
| 7-7 | `Footer.tsx` に `role="contentinfo"` 追加 | `frontend/src/components/Footer.tsx` | §5.4.1 |

#### 2.7.2 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-7-1 | `api.ts` を Client Component からインポートするとビルドエラーになる | テスト用 Client Component を一時作成 → `npm run build` → エラー確認 → テストファイル削除 |
| CP-7-2 | エラーバウンダリが表示される | API を停止した状態で `/articles` にアクセス |
| CP-7-3 | aria 属性が正しく付与されている | ブラウザ DevTools で確認 |
| CP-7-4 | フロントエンドが正常にビルドされる | `docker compose build news-frontend` |

---

### Step 8: CI/CD セキュリティスキャン

| 項目 | 内容 |
|------|------|
| ブランチ | `feature/phase1.2-ci-security` |
| 依存関係 | Step 1〜7 全完了後 |
| 設計書参照 | §5.5 |
| 推定変更ファイル数 | 3 |

#### 2.8.1 タスク一覧

| # | タスク | ファイル | 設計書参照 |
|---|--------|---------|-----------|
| 8-1 | `bandit>=1.9.3`, `pip-audit>=2.10.0` を追加 | `api/requirements-dev.txt` | §2.1 |
| 8-2 | GitHub Actions ワークフロー作成（lint, sast, dependency-scan, test, docker-build） | `.github/workflows/security.yml` (新規) | §5.5.1 |
| 8-3 | Makefile に `lint`, `sast`, `audit`, `security` コマンド追加 | `Makefile` | §5.5.2 |

#### 2.8.2 チェックポイント

| # | 検証項目 | 方法 |
|---|---------|------|
| CP-8-1 | `make security` が正常に完了する | ローカルで実行 |
| CP-8-2 | GitHub Actions が PR で自動実行される | PR 作成後に Actions タブで確認 |
| CP-8-3 | bandit が既存コードで CRITICAL/HIGH の指摘なし | `make sast` |
| CP-8-4 | pip-audit が既知の脆弱性なし | `make audit` |

---

## 3. 実施スケジュール

### 3.1 推奨実施順序

```
Phase A: 基盤整備
  └─ Step 1: 入力検証強化
       └─ PR → main マージ

Phase B: セキュリティ・インフラ（並行実施）
  ├─ Step 2: API Key 認証 → PR → main マージ
  ├─ Step 4: セキュリティヘッダー → PR → main マージ
  ├─ Step 5: インフラ強化 → PR → main マージ
  └─ Step 7: フロントエンド改善 → PR → main マージ

Phase C: レート制限
  └─ Step 3: レート制限 → PR → main マージ

Phase D: テスト充実
  └─ Step 6: サービス層テスト → PR → main マージ

Phase E: CI/CD
  └─ Step 8: CI/CD セキュリティスキャン → PR → main マージ
```

### 3.2 各 Phase のゲート条件

| Phase | 開始条件 | 完了条件 |
|-------|---------|---------|
| A | 設計承認済み | Step 1 の全 CP パス + main マージ |
| B | Phase A 完了 | Step 2, 4, 5, 7 の全 CP パス + 各 main マージ |
| C | Phase B の Step 2 完了 | Step 3 の全 CP パス + main マージ |
| D | Phase B の Step 2 完了 | Step 6 の全 CP パス + main マージ |
| E | Phase A〜D 全完了 | Step 8 の全 CP パス + main マージ |

---

## 4. ファイル変更サマリ

### 4.1 ステップ別ファイルマッピング

| ファイル | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Step 7 | Step 8 |
|---------|--------|--------|--------|--------|--------|--------|--------|--------|
| `api/app/config.py` | | M | | | M | | | |
| `api/app/main.py` | | M | M | M | | | | |
| `api/app/dependencies.py` | | **N** | | | | | | |
| `api/app/middleware.py` | | | | **N** | | | | |
| `api/app/schemas/__init__.py` | M | | | | | | | |
| `api/app/schemas/article.py` | M | | | | | | | |
| `api/app/schemas/digest.py` | M | | | | | | | |
| `api/app/routers/articles.py` | | M | M | | | | | |
| `api/app/routers/digest.py` | | M | M | | | | | |
| `api/app/routers/ingest.py` | | M | M | | | | | |
| `api/app/routers/sse.py` | | | M | | | | | |
| `api/app/services/article_service.py` | M | | | | | | | |
| `api/app/services/sse_broker.py` | | | M | | | | | |
| `api/requirements.txt` | | | M | | | | | |
| `api/requirements-dev.txt` | | | | | | | | M |
| `api/Dockerfile` | | | | | M | | | |
| `api/.dockerignore` | | | | | **N** | | | |
| `api/tests/conftest.py` | | M | M | | | | | |
| `api/tests/test_articles.py` | | M | | | | | | |
| `api/tests/test_digest.py` | | M | | | | | | |
| `api/tests/test_ingest.py` | | M | | | | | | |
| `api/tests/test_article_service.py` | | | | | | **N** | | |
| `api/tests/test_digest_service.py` | | | | | | **N** | | |
| `api/tests/test_article_monitor.py` | | | | | | **N** | | |
| `api/alembic/env.py` | | | | | M | | | |
| `docker-compose.yml` | | | | | M | | | |
| `docker-compose.dev.yml` | | | | | M | | | |
| `db/init/01-create-app-user.sql` | | | | | **N** | | | |
| `frontend/Dockerfile` | | | | | M | | | |
| `frontend/.dockerignore` | | | | | **N** | | | |
| `frontend/package.json` | | | | | | | M | |
| `frontend/src/lib/api.ts` | | | | | | | M | |
| `frontend/src/app/error.tsx` | | | | | | | **N** | |
| `frontend/src/components/Header.tsx` | | | | | | | M | |
| `frontend/src/components/ArticleListLive.tsx` | | | | | | | M | |
| `frontend/src/components/ArticleCard.tsx` | | | | | | | M | |
| `frontend/src/components/Footer.tsx` | | | | | | | M | |
| `.env.example` | | M | | | M | | | |
| `Makefile` | | | | | | | | M |
| `.github/workflows/security.yml` | | | | | | | | **N** |

**凡例**: M = 変更、**N** = 新規作成

### 4.2 集計

| 区分 | ファイル数 |
|------|-----------|
| 変更ファイル | 29 |
| 新規ファイル | 10 |
| **合計** | **39** |

---

## 5. テスト影響まとめ

| テスト種別 | Phase 1.0/1.1 | Phase 1.2 変更 | Phase 1.2 追加 | 合計 |
|-----------|--------------|---------------|---------------|------|
| 統合テスト（articles） | 9 | ヘッダー追加 | +2（認証） | 11 |
| 統合テスト（digest） | 6 | ヘッダー追加 | +2（認証） | 8 |
| 統合テスト（health） | 1 | — | — | 1 |
| 統合テスト（ingest） | 7 | ヘッダー追加 | +2（認証） | 9 |
| 統合テスト（SSE） | 6 | — | — | 6 |
| 単体テスト（url_validator） | 8 | — | — | 8 |
| 単体テスト（article_service） | 0 | — | +6 | 6 |
| 単体テスト（digest_service） | 0 | — | +6 | 6 |
| 単体テスト（article_monitor） | 1 | — | +3 | 4 |
| **合計** | **38** | — | **+21** | **59** |

---

## 6. 手動検証チェックリスト

Phase 1.2 全ステップ完了後、以下の手動検証を実施する。

| # | 項目 | 検証方法 | 期待結果 |
|---|------|---------|---------|
| V-1 | API Key 認証 | `curl -X POST /articles` (キーなし) | 401 |
| V-2 | API Key 認証 | `curl -X POST /articles -H "X-API-Key: valid"` | 201 |
| V-3 | レート制限 | POST /ingest を 11 回連続実行 | 11 回目で 429 |
| V-4 | セキュリティヘッダー | `curl -I /health` | 8 ヘッダーすべて存在 |
| V-5 | CORS | ブラウザ DevTools で preflight | X-API-Key が許可ヘッダーに含まれる |
| V-6 | ネットワーク分離 | `docker compose exec news-frontend ping news-db` | 到達不可 |
| V-7 | DB ユーザー分離 | `news_app` で `DROP TABLE` | 権限エラー |
| V-8 | server-only | Client Component から api.ts をインポート | ビルドエラー |
| V-9 | エラーバウンダリ | API 停止状態で `/articles` にアクセス | エラー画面表示 |
| V-10 | Swagger UI | 本番環境で `/docs` にアクセス | 404 |
| V-11 | Swagger UI | 開発環境で `/docs` にアクセス | 正常表示 |
| V-12 | CI/CD | PR 作成 | セキュリティスキャン自動実行 |

---

## 7. 注意事項

### 7.1 CLAUDE.md 遵守事項

- 各ステップの実装前に、明示的な「実装してよい」の承認を取得すること
- 各ステップで新しいフィーチャーブランチを作成すること
- main ブランチへの直接変更は禁止
- 設計書の範囲外の変更を行わないこと

### 7.2 マージ戦略

各ステップのブランチは main へのマージ時に以下を確認:
1. `make test` で全テストパス
2. コンフリクトの解消（特に `main.py`, `conftest.py` は複数ステップで変更あり）
3. PR レビュー

### 7.3 コンフリクト注意ファイル

以下のファイルは複数ステップで変更されるため、マージ順序に注意:

| ファイル | 変更ステップ |
|---------|------------|
| `api/app/main.py` | Step 2, 3, 4 |
| `api/app/config.py` | Step 2, 5 |
| `api/tests/conftest.py` | Step 2, 3 |
| `.env.example` | Step 2, 5 |

推奨マージ順: Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 7 → Step 6 → Step 8

---

## 8. 参考文献

| 文書 | リンク |
|------|--------|
| 設計書 | `docs/DESIGN-v2.0.md` |
| 要件仕様書 | `docs/REQUIREMENTS-v2.0.md` |
| CLAUDE.md | `CLAUDE.md` |
