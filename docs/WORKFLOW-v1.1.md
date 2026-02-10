# Tech News Curator — Phase 1.1 実装ワークフロー

> **Version**: 1.0
> **Date**: 2026-02-10
> **Source**: `docs/DESIGN-v1.1-TASKS.md` v1.4
> **Status**: 承認待ち

---

## 前提条件

- 設計書 v1.4 のレビュー承認済みであること
- main ブランチがクリーンな状態であること
- Python 3.12 + Node.js 20 がローカルにインストール済みであること

## ブランチ戦略

```
main
 └── feature/phase1.1-security-sse
      ├── Step 1-3: セキュリティ + テスト (API)
      ├── Step 4-5: SSE (API + Frontend)
      └── Step 6-7: CI/CD
```

単一ブランチ `feature/phase1.1-security-sse` で全 7 Task を実装し、最終的に main へ PR を作成する。

---

## Step 1: ブランチ作成

**操作**: main から `feature/phase1.1-security-sse` ブランチを作成

**チェックポイント**: `git branch --show-current` で確認

---

## Step 2: Task 1 — SSRF 対策

**依存**: なし

### 2-1: 新規ファイル作成

| ファイル | 内容 |
|---------|------|
| `api/app/services/url_validator.py` | `UnsafeURLError`, `is_safe_ip()`, `_resolve_with_timeout()`, `validate_url()` |
| `api/app/services/safe_fetch.py` | `_resolve_and_validate()`, `_make_request()` (host_header ポート対応含む), `safe_fetch()` |

### 2-2: 既存ファイル修正

| ファイル | 変更 |
|---------|------|
| `api/app/services/ingest_service.py` | `fetch_url` → `safe_fetch` に置換 |
| `api/app/routers/ingest.py` | `UnsafeURLError` の try/except 追加 |

### 2-3: テスト作成

| ファイル | テスト数 |
|---------|---------|
| `api/tests/test_url_validator.py` | 11 テスト (単体: validate_url + safe_fetch) |
| `api/tests/test_ingest.py` | 既存4テストの mock パス修正 (`fetch_url` → `safe_fetch`) + 3テスト追加 |

### チェックポイント

```bash
cd api && python -m pytest tests/test_url_validator.py tests/test_ingest.py -v
```

全テスト PASS を確認してから次へ。

---

## Step 3: Task 2 — 著作権対応テスト

**依存**: なし (Step 2 と独立だが順次実行)

### 3-1: テスト追加

| ファイル | 変更 |
|---------|------|
| `api/tests/test_articles.py` | `test_list_articles_excludes_body_original`, `test_detail_excludes_body_original` の 2テスト追加 |

### チェックポイント

```bash
cd api && python -m pytest tests/test_articles.py -v
```

---

## Step 4: Task 3 — CORS / fetch タイムアウト修正

**依存**: なし (Step 2-3 と独立だが順次実行)

### 4-1: API 側 (CORS 環境変数化 + allow_headers 制限)

| ファイル | 変更 |
|---------|------|
| `api/app/config.py` | `cors_origins: list[str]` フィールド追加 |
| `api/app/main.py` | `allow_origins=settings.cors_origins`, `allow_headers=["Content-Type", "Accept"]` |

### 4-2: フロントエンド側 (fetch タイムアウト)

| ファイル | 変更 |
|---------|------|
| `frontend/src/lib/api.ts` | 全 4 関数に `signal: AbortSignal.timeout(10_000)` 追加 |

### 4-3: 環境変数ドキュメント

| ファイル | 変更 |
|---------|------|
| `.env.example` | `CORS_ORIGINS` 追加 |

### チェックポイント

```bash
cd api && python -m pytest tests/ -v
```

既存テスト全件 PASS を確認（CORS 変更がテストに影響しないこと）。

---

## Step 5: Task 4 — SSE API エンドポイント

**依存**: Step 4 完了後 (main.py の変更が競合するため)

### 5-1: 依存関係追加

| ファイル | 変更 |
|---------|------|
| `api/requirements.txt` | `sse-starlette>=3.2.0,<4.0.0` 追加 |

```bash
cd api && pip install -r requirements.txt
```

### 5-2: 新規ファイル作成

| ファイル | 内容 |
|---------|------|
| `api/app/services/sse_broker.py` | `SSEBroker` クラス (Queue maxsize=64) |
| `api/app/services/article_monitor.py` | `article_monitor()` バックグラウンドタスク |
| `api/app/routers/sse.py` | `GET /articles/stream` SSE エンドポイント |

### 5-3: 既存ファイル修正

| ファイル | 変更 |
|---------|------|
| `api/app/main.py` | lifespan に `article_monitor` タスク追加 + `sse.router` 登録 |

**注意**: Step 4 で `main.py` を変更済みなので、その変更に追加する形で修正する。

### 5-4: テスト作成

| ファイル | テスト数 |
|---------|---------|
| `api/tests/test_sse.py` | 5 テスト (broker 単体 + endpoint + monitor) |

### チェックポイント

```bash
cd api && python -m pytest tests/ -v
```

全テスト PASS を確認。

---

## Step 6: Task 5 — SSE フロントエンド自動更新

**依存**: Step 5 完了後 (API の SSE エンドポイントが必要)

### 6-1: 新規ファイル作成

| ファイル | 内容 |
|---------|------|
| `frontend/src/components/ArticleListLive.tsx` | Client Component (useRef EventSource + visibilitychange) |

### 6-2: 既存ファイル修正

| ファイル | 変更 |
|---------|------|
| `frontend/src/app/page.tsx` | ArticleCard 直接使用 → ArticleListLive に変更 |
| `frontend/src/app/articles/page.tsx` | 同上 |

### 6-3: Docker Compose / 環境変数

| ファイル | 変更 |
|---------|------|
| `docker-compose.dev.yml` | `NEXT_PUBLIC_SSE_URL: http://localhost:8100` 追加 |
| `.env.example` | `PUBLIC_API_URL` 追加 |

### チェックポイント

```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
```

TypeScript コンパイルエラー・lint エラーなしを確認。

---

## Step 7: Task 6 — テスト CI

**依存**: Step 1-6 全完了後 (全テストが通過することを確認してから)

### 7-1: 新規ファイル作成

| ファイル | 内容 |
|---------|------|
| `.github/workflows/ci.yml` | `api-test` + `frontend-lint` の 2 ジョブ |

### チェックポイント

ファイル作成のみ。CI の動作確認は PR 作成後に GitHub 上で実施。

---

## Step 8: Task 7 — release-please 設定

**依存**: Step 7 完了後 (CI が最後のファイル変更)

### 8-1: 新規ファイル作成

| ファイル | 内容 |
|---------|------|
| `release-please-config.json` | モノレポ設定 (api: python, frontend: node) |
| `.release-please-manifest.json` | `{"api": "1.0.0", "frontend": "0.1.0"}` |
| `.github/workflows/release-please.yml` | release-please-action v4 |

### チェックポイント

JSON ファイルのバリデーション:
```bash
python -m json.tool release-please-config.json > /dev/null
python -m json.tool .release-please-manifest.json > /dev/null
```

---

## Step 9: 最終検証

### 9-1: 全 API テスト実行

```bash
cd api && python -m pytest tests/ -v
```

### 9-2: フロントエンド lint + 型チェック

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

### 9-3: git status 確認

変更対象外のファイルが変更されていないこと。

### 9-4: コミット

Conventional Commits 形式で Task ごとにコミット:

```
feat(api): add SSRF protection with safe_fetch
test(api): add copyright compliance tests
fix(api): restrict CORS headers and make origins configurable
feat(api): add SSE endpoint for article streaming
feat(frontend): add SSE-based live article updates
ci: add GitHub Actions test workflow
chore: configure release-please for monorepo
```

---

## Step 10: PR 作成

```bash
gh pr create --title "feat: Phase 1.1 security hardening + SSE auto-update + CI/CD" --body "..."
```

CI が PASS することを確認。

---

## ファイル変更サマリー

| Step | Task | 新規 | 変更 | テスト |
|------|------|------|------|--------|
| 2 | SSRF 対策 | 2 | 2 | 14 |
| 3 | 著作権テスト | 0 | 1 | 2 |
| 4 | CORS/timeout | 0 | 4 | 0 |
| 5 | SSE API | 3 | 2 | 5 |
| 6 | SSE Frontend | 1 | 3 | 0 |
| 7 | CI | 1 | 0 | 0 |
| 8 | release-please | 3 | 0 | 0 |
| **計** | | **10** | **12** | **21** |
