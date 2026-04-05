# Database Migration System Design

Version: 1.0
Date: 2026-04-04
Status: Draft

## 1. Background

TypeScript 書き換え（2026-02-25）時に `drizzle-kit generate` を実行せず、SQL マイグレーションファイルが一度も生成されていない。`drizzle-kit push`（スキーマの直接反映）に依存してきたが、`drizzle-kit` は devDependency であり本番 Docker イメージに含まれない。そのため `make migrate-up` と `make deploy` のマイグレーション実行が本番環境で動作しない。

テストは `tests/setup.ts` 内の raw SQL でテーブルを作成しており、Drizzle スキーマとの整合性が手動管理になっている。

## 2. Goals

- G1: SQL マイグレーションファイルを `drizzle-kit generate` で生成し、git で管理する
- G2: 本番環境で `drizzle-kit` なしにマイグレーションを適用する（`drizzle-orm` のみ使用）
- G3: テストが本番と同じマイグレーションパスを使用し、スキーマ乖離を防止する
- G4: 既存の DB ロール分離（`news`=DDL, `news_app`=DML）を維持する

## 3. Architecture

### 3.1 Migration Workflow

```
[開発時]                              [本番/デプロイ時]
                                      
  Schema 変更                           make deploy / make migrate-up
       |                                      |
  drizzle-kit generate                 docker compose exec news-api
       |                                 node dist/run-migrate.js
  SQL ファイル生成                             |
  (src/db/migrations/*.sql)            drizzle-orm migrate()
       |                                      |
  git commit & push                    __drizzle_migrations で
                                       適用済みを追跡
```

### 3.2 Component Diagram

```
api/
├── src/
│   ├── index.ts              ← API サーバー (news_app で接続、マイグレーション実行しない)
│   ├── database.ts           ← Drizzle クライアント (news_app)
│   ├── config.ts             ← DATABASE_URL, DATABASE_ADMIN_URL
│   └── db/
│       ├── schema/
│       │   ├── articles.ts   ← テーブル定義
│       │   ├── sources.ts
│       │   ├── digests.ts
│       │   └── index.ts
│       ├── migrate.ts        ← [新規] runMigrations() 関数
│       ├── run-migrate.ts    ← [新規] CLI エントリポイント
│       └── migrations/       ← [新規] drizzle-kit generate の出力
│           ├── 0000_initial.sql
│           └── meta/
│               ├── _journal.json
│               └── 0000_snapshot.json
├── dist/
│   ├── index.js              ← tsup バンドル (API)
│   └── run-migrate.js        ← tsup バンドル (マイグレーション)
└── Dockerfile                ← migrations/ を production イメージにコピー
```

### 3.3 Database Role Separation

| Role | 用途 | 接続元 | 権限 |
|------|------|--------|------|
| `news` | DDL（マイグレーション） | `run-migrate.ts` via `DATABASE_ADMIN_URL` | Superuser |
| `news_app` | DML（API ランタイム） | `index.ts` via `DATABASE_URL` | SELECT, INSERT, UPDATE のみ |

`migrate()` は `drizzle` スキーマに `__drizzle_migrations` テーブルを作成する。これは `news` ユーザーの権限で実行され、`news_app` はアクセスしない。

## 4. Detailed Design

### 4.1 `api/src/db/migrate.ts`

```typescript
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_ADMIN_URL or DATABASE_URL must be set"
    );
  }

  const migrationsFolder = path.resolve(
    process.cwd(),
    "src/db/migrations"
  );

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    console.log("Running migrations...");
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied successfully.");
  } finally {
    await client.end();
  }
}
```

**設計判断:**
- `DATABASE_ADMIN_URL` を優先し、未設定時は `DATABASE_URL` にフォールバック（dev 用）
- `process.cwd()` ベースのパス解決: Docker（cwd=/app）、ローカル dev（cwd=api/）、テスト（cwd=api/）すべてで `src/db/migrations` に解決
- `max: 1` でコネクション1本のみ（マイグレーションは逐次実行）
- `finally` でコネクション確実クローズ

### 4.2 `api/src/db/run-migrate.ts`

```typescript
import { runMigrations } from "./migrate.js";

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
```

### 4.3 tsup.config.ts 変更

```typescript
entry: ["src/index.ts", "src/db/run-migrate.ts"],
```

2つのエントリポイントが `dist/index.js` と `dist/run-migrate.js` にバンドルされる。`splitting: false` のため各バンドルは独立。

### 4.4 Dockerfile 変更

```dockerfile
# production ステージ
COPY --from=builder /app/dist ./dist
COPY src/db/migrations/ ./src/db/migrations/   # ← 追加
```

SQL ファイルはコンパイル不要のため、builder ステージではなくビルドコンテキストから直接コピー。`readMigrationFiles()` は `fs.readFileSync` で `.sql` ファイルを読むため、物理ファイルが必要。

### 4.5 Makefile 変更

```makefile
# SQL 生成（開発時のみ、ホストで実行）
migrate:
    cd api && npx drizzle-kit generate

# マイグレーション適用（本番コンテナ内）
migrate-up:
    docker compose exec news-api node dist/run-migrate.js

# デプロイ
deploy:
    $(COMPOSE_PROD) up -d news-db
    $(COMPOSE_PROD) up -d news-api
    $(COMPOSE_PROD) exec news-api node dist/run-migrate.js
    $(COMPOSE_PROD) up -d news-frontend
```

### 4.6 package.json scripts 変更

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx src/db/run-migrate.ts",
"db:push": "drizzle-kit push"
```

### 4.7 tests/setup.ts 変更

raw SQL（`CREATE TABLE IF NOT EXISTS ...` 約40行）を削除し、`migrate()` に置換:

```typescript
import { migrate } from "drizzle-orm/postgres-js/migrator";

// beforeAll 内
await migrate(testDb, { migrationsFolder: "./src/db/migrations" });
```

### 4.8 初期マイグレーション

`drizzle-kit generate` 実行後、生成された SQL に `IF NOT EXISTS` を追加:

```sql
CREATE TABLE IF NOT EXISTS "articles" ( ... );
CREATE INDEX IF NOT EXISTS "ix_articles_published_at" ON "articles" (...);
CREATE TABLE IF NOT EXISTS "sources" ( ... );
CREATE TABLE IF NOT EXISTS "digests" ( ... );
```

**理由:** 既存の本番 DB は `drizzle-kit push` で作成されており、`drizzle.__drizzle_migrations` テーブルが存在しない。`migrate()` 初回実行時に全マイグレーションを「未適用」と判断して実行するため、`IF NOT EXISTS` がないと既存テーブルで失敗する。

## 5. Design Decisions

### 5.1 アプリ起動時にマイグレーションを実行しない

| 観点 | 理由 |
|------|------|
| ロール分離 | API は `news_app`（DML のみ）で接続。DDL には `news` が必要 |
| 競合リスク | 複数コンテナ同時起動時にマイグレーション競合 |
| 運用制御 | `make migrate-up` で明示的にタイミングを制御 |

### 5.2 `run-migrate.ts` を分離する

API サーバー（`index.ts`）とマイグレーション（`run-migrate.ts`）は異なる責務:
- 異なる DB 接続先（`DATABASE_ADMIN_URL` vs `DATABASE_URL`）
- 異なるライフサイクル（ワンショット vs 常駐）
- 異なる実行コンテキスト（`docker compose exec` vs `CMD`）

### 5.3 `IF NOT EXISTS` による初期マイグレーションの冪等化

Baseline insert（`__drizzle_migrations` に手動行挿入）より簡潔で確実。初回マイグレーションのみの対応であり、以降のマイグレーションは通常の `CREATE TABLE` / `ALTER TABLE` で生成される。

## 6. Risks

| リスク | 重要度 | 対策 |
|--------|--------|------|
| 生成 SQL が既存テーブルと不一致 | High | `tests/setup.ts` の raw SQL と行単位で比較 |
| Docker 内のパス解決失敗 | High | `process.cwd()` ベース + Dockerfile で `/app/src/db/migrations/` にコピー |
| 既存 DB で初期マイグレーション失敗 | High | `IF NOT EXISTS` で冪等化 |
| tsup が SQL をバンドルに含める | Low | `fs.readFileSync` は実行時解決。tsup はバンドルしない |

## 7. File Changes

| ファイル | 操作 | 概算行数 |
|---------|------|---------|
| `api/src/db/migrate.ts` | 新規 | ~30 |
| `api/src/db/run-migrate.ts` | 新規 | ~10 |
| `api/tsup.config.ts` | 修正 | 1行変更 |
| `api/package.json` | 修正 | 1行変更 |
| `api/src/db/migrations/` | 生成 | drizzle-kit 自動生成 |
| `api/Dockerfile` | 修正 | 1行追加 |
| `Makefile` | 修正 | 2行変更 |
| `api/tests/setup.ts` | 修正 | -35行（raw SQL 削除）, +3行 |

## 8. Verification

1. `drizzle-kit generate` → 生成 SQL を目視確認
2. `IF NOT EXISTS` を初期 SQL に追加
3. `npm run build` → `dist/run-migrate.js` 生成確認
4. `npm test` → 全テスト通過
5. `make migrate-up` → マイグレーション成功
6. `make migrate-up` 2回目 → 冪等性確認
