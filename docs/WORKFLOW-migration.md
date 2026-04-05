# Implementation Workflow: Database Migration System

Design Doc: `docs/DESIGN-migration.md`
Date: 2026-04-04

## Prerequisites

- [ ] Docker Desktop の Virtual file sharing を gRPC FUSE に変更済み（VirtioFS 4.67.0 バグ回避）
- [ ] 設計書 `docs/DESIGN-migration.md` が承認済み

## Phase 1: Migration Runner（新規ファイル作成）

依存: なし

### Step 1.1: `api/src/db/migrate.ts` 作成

- `runMigrations()` 関数を export
- `DATABASE_ADMIN_URL` → `DATABASE_URL` フォールバック
- `drizzle-orm/postgres-js/migrator` の `migrate()` を使用
- パス: `path.resolve(process.cwd(), "src/db/migrations")`

### Step 1.2: `api/src/db/run-migrate.ts` 作成

- `runMigrations()` を import して実行
- exit code 0/1 で成功/失敗を返す

### Step 1.3: `api/tsup.config.ts` 修正

- `entry` に `"src/db/run-migrate.ts"` を追加

### Step 1.4: `api/package.json` scripts 修正

- `"db:migrate"` を `"tsx src/db/run-migrate.ts"` に変更

### Checkpoint 1

- [ ] `cd api && npm run build` が成功し、`dist/run-migrate.js` が生成される
- [ ] `dist/run-migrate.js` のファイルサイズが妥当（数百KB〜数MB）

## Phase 2: 初期マイグレーション SQL 生成

依存: なし（Phase 1 と並行可能だが、Phase 3 の前に完了が必要）

### Step 2.1: `drizzle-kit generate` 実行

```bash
cd api && npx drizzle-kit generate
```

### Step 2.2: 生成 SQL の検証

- 生成された `src/db/migrations/0000_*.sql` を `tests/setup.ts` の raw SQL（L22-60）と比較
- テーブル名、カラム名、型、デフォルト値、UNIQUE 制約、INDEX が一致することを確認

### Step 2.3: `IF NOT EXISTS` 追加

- 全 `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
- 全 `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`

### Step 2.4: git add

- `api/src/db/migrations/` 配下の全ファイルをステージ

### Checkpoint 2

- [ ] `api/src/db/migrations/meta/_journal.json` が存在する
- [ ] SQL 内容が既存スキーマと一致する
- [ ] 全 DDL 文に `IF NOT EXISTS` が付いている

## Phase 3: テスト更新

依存: Phase 1（migrate.ts）, Phase 2（migrations/）

### Step 3.1: `api/tests/setup.ts` 修正

- `import { migrate } from "drizzle-orm/postgres-js/migrator"` 追加
- `beforeAll` 内の raw SQL（L22-60）を `migrate()` 呼び出しに置換
- `TRUNCATE` の `beforeEach` はそのまま維持

### Checkpoint 3

- [ ] `cd api && npm test` が全テスト通過（既存 147 テスト）
- [ ] テスト実行時間が大幅に増加していない（マイグレーション適用は高速）

## Phase 4: Docker & デプロイ更新

依存: Phase 1, Phase 2

### Step 4.1: `api/Dockerfile` 修正

- production ステージに `COPY src/db/migrations/ ./src/db/migrations/` 追加

### Step 4.2: `Makefile` 修正

- `migrate-up`: `docker compose exec news-api node dist/run-migrate.js`
- `deploy`: 同上

### Checkpoint 4

- [ ] `make build` が成功する
- [ ] ビルドされたイメージ内に `src/db/migrations/` が存在する:
  ```bash
  docker run --rm --entrypoint="" <image> ls src/db/migrations/
  ```

## Phase 5: 統合検証

依存: Phase 1-4 全完了

### Step 5.1: 空 DB へのマイグレーション

```bash
make migrate-up
```

- テーブル作成を確認: `docker compose exec news-db psql -U news -d news_curator -c '\dt'`

### Step 5.2: 冪等性確認

```bash
make migrate-up  # 2回目
```

- エラーなしで完了すること

### Step 5.3: API 動作確認

- ヘルスチェック: `curl http://localhost:8100/health`
- 記事一覧: `curl -H "X-API-Key: <key>" http://localhost:8100/articles`

### Step 5.4: n8n からのデータ登録確認

- n8n ワークフローを実行し、記事の ingest が成功すること

### Final Checkpoint

- [ ] 空 DB からのマイグレーションが成功する
- [ ] マイグレーションの2回目実行がエラーなし
- [ ] API のヘルスチェックが 200 を返す
- [ ] n8n からのデータ登録が成功する
- [ ] 全テスト通過（`cd api && npm test`）
- [ ] Biome lint 通過（`cd api && npx biome check src/`）
- [ ] TypeScript 型チェック通過（`cd api && npx tsc --noEmit`）

## Execution Order

```
Phase 1 (Runner)  ──┐
                    ├──→ Phase 3 (Tests) ──→ Phase 5 (Integration)
Phase 2 (SQL Gen) ──┤
                    └──→ Phase 4 (Docker) ──→ Phase 5 (Integration)
```

Phase 1 と Phase 2 は並行実行可能。Phase 3 と Phase 4 も並行実行可能。Phase 5 は全 Phase 完了後。
