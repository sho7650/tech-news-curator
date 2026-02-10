# 実装ワークフロー: GitHub 公開前セキュリティ・品質修正

設計書: `docs/SECURITY-FIXES.md` (v1.0)

## フェーズ構成

```
Phase 1: API セキュリティ修正     (#1, #4, #10)  → make test で検証
Phase 2: API 機能改善             (#7, #8)        → make test で検証
Phase 3: Docker / インフラ修正    (#2, #3, #6)    → make dev で検証
Phase 4: フロントエンド修正       (#5, #9)        → npm run build で検証
Phase 5: ドキュメント修正         (#3 の残り)      → grep で検証
Phase 6: 最終検証                                  → 全体テスト
```

---

## Phase 1: API セキュリティ修正

最優先。認証情報とバリデーションの問題を修正。テストで即座に検証可能。

### Step 1.1 — config.py パスワード削除 (修正 #1)

| 項目 | 内容 |
|------|------|
| ファイル | `api/app/config.py` |
| 作業 | デフォルト値 `password` → `CHANGEME`、`validate_production()` 追加 |
| 依存 | なし |

### Step 1.2 — main.py に validate_production 呼び出し追加 (修正 #1)

| 項目 | 内容 |
|------|------|
| ファイル | `api/app/main.py` |
| 作業 | lifespan 内で `settings.validate_production()` を呼ぶ |
| 依存 | Step 1.1 |

### Step 1.3 — IngestRequest URL バリデーション (修正 #4)

| 項目 | 内容 |
|------|------|
| ファイル | `api/app/schemas/ingest.py`, `api/app/routers/ingest.py` |
| 作業 | `url: str` → `url: HttpUrl`、router で `str()` キャスト |
| 依存 | なし |

### Step 1.4 — _parse_date エラーハンドリング (修正 #10)

| 項目 | 内容 |
|------|------|
| ファイル | `api/app/routers/articles.py` |
| 作業 | `date.fromisoformat()` + try/except で 400 を返す |
| 依存 | なし |

### Step 1.5 — 新規テスト追加 (#4, #10)

| 項目 | 内容 |
|------|------|
| ファイル | `api/tests/test_ingest.py`, `api/tests/test_articles.py` |
| 作業 | `test_ingest_invalid_url`、`test_list_articles_invalid_date` 追加 |
| 依存 | Step 1.3, 1.4 |

### Checkpoint 1

```bash
make test
# 期待結果: 19 passed (既存17 + 新規2)
```

---

## Phase 2: API 機能改善

### Step 2.1 — Digest ページネーション (修正 #7)

| 項目 | 内容 |
|------|------|
| ファイル | `api/app/services/digest_service.py`, `api/app/routers/digest.py`, `api/app/schemas/digest.py` |
| 作業 | `page`/`per_page` パラメータ追加（Articles と同パターン） |
| 依存 | なし |

### Step 2.2 — Digest テスト更新 (#7)

| 項目 | 内容 |
|------|------|
| ファイル | `api/tests/test_digest.py` |
| 作業 | 既存テストに `page`/`per_page` アサーション追加 |
| 依存 | Step 2.1 |

### Step 2.3 — CORS ミドルウェア追加 (修正 #8)

| 項目 | 内容 |
|------|------|
| ファイル | `api/app/main.py` |
| 作業 | `CORSMiddleware` 追加 |
| 依存 | なし（Step 1.2 と同ファイルだが別箇所） |

### Checkpoint 2

```bash
make test
# 期待結果: 20 passed (Phase 1 の19 + digest テスト更新1)
```

---

## Phase 3: Docker / インフラ修正

テストに影響しない変更。`make dev` で動作確認。

### Step 3.1 — docker-compose.dev.yml 環境変数化 (修正 #2)

| 項目 | 内容 |
|------|------|
| ファイル | `docker-compose.dev.yml` |
| 作業 | `devpassword` → `${POSTGRES_PASSWORD:-devpassword}` |
| 依存 | なし |

### Step 3.2 — docker-compose.yml レジストリ変数化 (修正 #3 一部)

| 項目 | 内容 |
|------|------|
| ファイル | `docker-compose.yml` |
| 作業 | `registry.oshiire.to` → `${REGISTRY:-ghcr.io/your-org}` |
| 依存 | なし |

### Step 3.3 — Makefile レジストリ変数化 (修正 #3 一部)

| 項目 | 内容 |
|------|------|
| ファイル | `Makefile` |
| 作業 | `REGISTRY ?= ghcr.io/your-org` 変数定義、push ターゲット修正 |
| 依存 | なし |

### Step 3.4 — .env.example に REGISTRY 追加 (修正 #3 一部)

| 項目 | 内容 |
|------|------|
| ファイル | `.env.example` |
| 作業 | `REGISTRY=<your-registry-url>` 追加 |
| 依存 | なし |

### Step 3.5 — API Dockerfile 非 root 化 (修正 #6)

| 項目 | 内容 |
|------|------|
| ファイル | `api/Dockerfile` |
| 作業 | `adduser appuser` + `USER appuser` 追加 |
| 依存 | なし |

### Step 3.6 — Frontend Dockerfile 非 root 化 (修正 #6)

| 項目 | 内容 |
|------|------|
| ファイル | `frontend/Dockerfile` |
| 作業 | production ステージに `--chown=node:node` + `USER node` 追加 |
| 依存 | なし |

### Step 3.7 — docker-compose.dev.yml user override (修正 #6)

| 項目 | 内容 |
|------|------|
| ファイル | `docker-compose.dev.yml` |
| 作業 | news-api に `user: "root"` 追加（ボリュームマウント互換性） |
| 依存 | Step 3.5 |

### Checkpoint 3

```bash
make dev
# 期待結果: 全3サービスが正常起動、エラーなし
```

---

## Phase 4: フロントエンド修正

コメント追加と型定義の軽微な修正。

### Step 4.1 — ReactMarkdown 安全性コメント (修正 #5)

| 項目 | 内容 |
|------|------|
| ファイル | `frontend/src/app/articles/[id]/page.tsx` |
| 作業 | XSS 安全性を明示するコメント追加 |
| 依存 | なし |

### Step 4.2 — Next.js remotePatterns コメント (修正 #9)

| 項目 | 内容 |
|------|------|
| ファイル | `frontend/next.config.ts` |
| 作業 | `hostname: '**'` の意図を説明するコメント追加 |
| 依存 | なし |

### Step 4.3 — DigestListResponse 型更新 (#7)

| 項目 | 内容 |
|------|------|
| ファイル | `frontend/src/lib/types.ts` |
| 作業 | `DigestListResponse` に `page`, `per_page` フィールド追加 |
| 依存 | Step 2.1 |

### Checkpoint 4

```bash
cd frontend && npm run build
# 期待結果: ビルド成功、TypeScript エラーなし
```

---

## Phase 5: ドキュメント修正

`registry.oshiire.to` の残り箇所をすべて置換。

### Step 5.1 — CLAUDE.md レジストリ参照修正

| 項目 | 内容 |
|------|------|
| ファイル | `CLAUDE.md` |
| 作業 | `registry.oshiire.to` → `${REGISTRY}` に変更 |

### Step 5.2 — README.md / README.ja.md 修正

| 項目 | 内容 |
|------|------|
| ファイル | `README.md`, `README.ja.md` |
| 作業 | `make push` の説明を汎用化 |

### Step 5.3 — docs/DESIGN.md 修正

| 項目 | 内容 |
|------|------|
| ファイル | `docs/DESIGN.md` |
| 作業 | `registry.oshiire.to` → `<your-registry>` に全置換 |

### Step 5.4 — docs/REQUIREMENTS.md 修正

| 項目 | 内容 |
|------|------|
| ファイル | `docs/REQUIREMENTS.md` |
| 作業 | `registry.oshiire.to` → `<your-registry>` に全置換 |

### Checkpoint 5

```bash
grep -r "registry.oshiire.to" --include="*.md" --include="*.yml" --include="Makefile" .
# 期待結果: 0件
```

---

## Phase 6: 最終検証

### Step 6.1 — 全テスト実行

```bash
make test
# 期待結果: 20 passed
```

### Step 6.2 — 機密情報チェック

```bash
grep -r "registry.oshiire.to" .
# 期待結果: 0件 (SECURITY-FIXES.md, WORKFLOW-SECURITY-FIXES.md 以外)

grep -r "news:password@" .
# 期待結果: 0件
```

### Step 6.3 — Docker 起動確認

```bash
make dev
# 期待結果: 全3サービスが正常起動
```

### Step 6.4 — Git コミット

```bash
git add -A
git commit -m "Fix security issues for public GitHub release"
```

---

## 依存関係図

```
Phase 1 (API セキュリティ)
  Step 1.1 → Step 1.2
  Step 1.3 ──┐
  Step 1.4 ──┼→ Step 1.5 → Checkpoint 1
             │
Phase 2 (API 機能)
  Step 2.1 → Step 2.2 ──┐
  Step 2.3 ─────────────┼→ Checkpoint 2
                         │
Phase 3 (Docker)         │
  Step 3.1〜3.4 (並列可) │
  Step 3.5 → Step 3.7   │
  Step 3.6               ├→ Checkpoint 3
                         │
Phase 4 (Frontend)       │
  Step 4.1, 4.2 (並列可) │
  Step 4.3 ──────────────┼→ Checkpoint 4
                         │
Phase 5 (Docs)           │
  Step 5.1〜5.4 (並列可) ┼→ Checkpoint 5
                         │
Phase 6 (最終検証) ──────→ Commit
```

## 所要ステップ数

| フェーズ | ステップ数 | チェックポイント |
|----------|-----------|-----------------|
| Phase 1 | 5 | `make test` (19 passed) |
| Phase 2 | 3 | `make test` (20 passed) |
| Phase 3 | 7 | `make dev` |
| Phase 4 | 3 | `npm run build` |
| Phase 5 | 4 | `grep` |
| Phase 6 | 4 | 最終確認 + commit |
| **合計** | **26** | **6 checkpoints** |
