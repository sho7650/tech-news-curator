# Logging System Design

**Version**: 1.0
**Status**: Draft
**Date**: 2026-03-05

## 1. Background & Problem

### Current State

API 全体で `console.log/warn/error` が 9 箇所しかなく、以下の深刻な問題がある:

| 問題 | 影響 |
|------|------|
| **サイレント失敗** | `safeFetch` が非 200 応答・リダイレクト超過・Readability 失敗時にログなしで `null` を返す |
| **構造化なし** | プレーンテキスト出力のため、Docker/ELK/CloudWatch での検索・フィルタが困難 |
| **リクエスト追跡不可** | requestId がなく、ログ間の相関が取れない |
| **レベル制御なし** | `console.*` にはランタイムでのレベル切り替え機能がない |
| **コンテキスト不足** | エラーログに URL、ステータスコード、処理段階などの情報がない |

### Trigger

n8n の `POST /ingest` で `422 "Failed to extract content from URL"` が発生するが、API ログに何も出力されず原因の切り分けが不可能。

## 2. Design Goals

1. **全失敗パスのログ出力** — サイレントな `return null` を排除
2. **構造化 JSON ログ** — Docker / ログ集約基盤対応
3. **リクエストコンテキスト伝播** — requestId で一連の処理を追跡可能に
4. **ログレベル制御** — 環境変数で runtime 切り替え
5. **開発体験** — ローカルは人間が読めるカラー出力
6. **最小パフォーマンス影響** — 高速ロガーライブラリ採用
7. **後方互換性** — テスト既存コードへの影響を最小化

## 3. Technology Choice: Pino

| 候補 | 速度 | JSON出力 | Child Logger | 理由 |
|------|------|----------|-------------|------|
| **Pino** | ◎ (10x winston) | ネイティブ | ◎ | Node.js の de facto 標準。Docker に最適 |
| winston | △ | プラグイン | ○ | 低速、過機能 |
| Hono built-in logger | ○ | × | × | HTTP request/response のみ、構造化なし |
| console.* | ○ | × | × | 現状。機能不足 |

**選定**: **Pino** + **pino-pretty** (dev 用)

### Dependencies

```json
{
  "dependencies": {
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "pino-pretty": "^13.0.0"
  }
}
```

## 4. Architecture

```
                    ┌─────────────────────────┐
                    │   lib/logger.ts          │
                    │   Root Pino instance     │
                    │   LOG_LEVEL from env     │
                    │   Dev: pino-pretty       │
                    │   Prod: JSON lines       │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
   ┌──────────────┐  ┌────────────┐  ┌────────────────┐
   │ Middleware    │  │ Services   │  │ Background     │
   │ request-     │  │ (request   │  │ (root logger   │
   │ logger.ts    │  │ child)     │  │ directly)      │
   │              │  │            │  │                │
   │ - requestId  │  │ safeFetch  │  │ article-       │
   │ - child log  │  │ ingest-svc │  │ monitor        │
   │ - timing     │  │ etc.       │  │ sse-broker     │
   │ - X-Req-Id   │  │            │  │                │
   └──────────────┘  └────────────┘  └────────────────┘
```

## 5. File Structure

### New Files

| File | Purpose |
|------|---------|
| `api/src/lib/logger.ts` | Root logger factory, AppLogger type export |
| `api/src/middleware/request-logger.ts` | Hono middleware: requestId 生成、child logger、timing |
| `api/src/types.ts` | Hono AppEnv 型定義 (Variables に logger を追加) |

### Modified Files

| File | Change |
|------|--------|
| `api/src/index.ts` | Logger middleware 追加、console.* → logger に置換 |
| `api/src/middleware/error-handler.ts` | c.get('logger') で構造化エラーログ |
| `api/src/routes/ingest.ts` | Logger をサービスに渡す、失敗理由のログ |
| `api/src/routes/feed.ts` | console.error → logger.error |
| `api/src/services/safe-fetch.ts` | 全失敗パスにログ追加 |
| `api/src/services/ingest-service.ts` | 抽出段階ごとのログ追加 |
| `api/src/services/article-monitor.ts` | Root logger の child で構造化 |
| `api/src/services/sse-broker.ts` | Root logger の child で構造化 |

## 6. Detailed Design

### 6.1 `api/src/lib/logger.ts` — Root Logger

```typescript
import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const IS_DEV = (process.env.ENVIRONMENT ?? "development") === "development";

export const rootLogger = pino({
  level: LOG_LEVEL,
  ...(IS_DEV
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

export type AppLogger = pino.Logger;
```

- 本番: JSON lines (`{"level":30,"time":...,"msg":"..."}`)
- 開発: pino-pretty でカラー表示
- `LOG_LEVEL` 環境変数でランタイム制御 (`debug`, `info`, `warn`, `error`, `silent`)

### 6.2 `api/src/types.ts` — Hono AppEnv

```typescript
import type { AppLogger } from "./lib/logger.js";

export type AppEnv = {
  Variables: {
    logger: AppLogger;
  };
};
```

全ルートで `new Hono<AppEnv>()` を使い、`c.get('logger')` を型安全にする。

### 6.3 `api/src/middleware/request-logger.ts` — Request Logger Middleware

```typescript
import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { rootLogger } from "../lib/logger.js";
import type { AppEnv } from "../types.js";

export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = crypto.randomUUID();
  const method = c.req.method;
  const path = c.req.path;

  const logger = rootLogger.child({ requestId, method, path });
  c.set("logger", logger);

  const start = Date.now();
  logger.info("request started");

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  c.header("X-Request-Id", requestId);

  if (status >= 500) {
    logger.error({ status, duration }, "request completed");
  } else if (status >= 400) {
    logger.warn({ status, duration }, "request completed");
  } else {
    logger.info({ status, duration }, "request completed");
  }
};
```

**出力例** (JSON):
```json
{"level":30,"time":1709600000000,"requestId":"a1b2c3...","method":"POST","path":"/ingest","msg":"request started"}
{"level":40,"time":1709600001234,"requestId":"a1b2c3...","method":"POST","path":"/ingest","status":422,"duration":1234,"msg":"request completed"}
```

### 6.4 `api/src/services/safe-fetch.ts` — 全失敗パスにログ追加

**変更方針**: logger を optional パラメータとして受け取る。

```typescript
export async function safeFetch(
  url: string,
  logger?: AppLogger,
): Promise<string | null> {
  const log = logger?.child({ service: "safe-fetch" }) ?? rootLogger.child({ service: "safe-fetch" });
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS + 1; i++) {
    // ... existing validation ...

    let response;
    try {
      response = await makeRequest(currentUrl, resolvedIp);
    } catch (err) {
      log.warn({ url: currentUrl, error: err instanceof Error ? err.message : String(err) },
        "request failed");
      return null;
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.location;
      if (!location) {
        log.warn({ url: currentUrl, status: response.status },
          "redirect without Location header");
        return null;
      }
      currentUrl = new URL(location, currentUrl).toString();
      log.debug({ from: url, to: currentUrl, status: response.status }, "following redirect");
      continue;
    }

    if (response.status !== 200) {
      log.warn({ url: currentUrl, status: response.status },
        "non-200 response");
      return null;
    }

    log.debug({ url: currentUrl, bodyLength: response.body.length }, "fetch successful");
    return response.body;
  }

  log.warn({ url, maxRedirects: MAX_REDIRECTS }, "max redirects exceeded");
  return null;
}
```

### 6.5 `api/src/services/ingest-service.ts` — 抽出段階ログ

```typescript
export async function extractArticle(
  url: string,
  fetcher: (url: string) => Promise<string | null> = safeFetch,
  logger?: AppLogger,
): Promise<IngestResponse | null> {
  const log = logger?.child({ service: "ingest" }) ?? rootLogger.child({ service: "ingest" });

  log.info({ url }, "extraction started");

  const html = await fetcher(url);
  if (!html) {
    log.warn({ url }, "failed to fetch HTML");
    return null;
  }

  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) {
    log.warn({ url, htmlLength: html.length }, "Readability failed to parse article");
    return null;
  }

  // ... rest of extraction ...

  log.info({ url, title: article.title }, "extraction successful");
  return { ... };
}
```

### 6.6 `api/src/routes/ingest.ts` — ルートハンドラ

```typescript
const ingestRoute = new Hono<AppEnv>();

ingestRoute.post("/ingest", ..., async (c) => {
  const { url } = c.req.valid("json");
  const logger = c.get("logger");

  try {
    const result = await extractArticle(url, safeFetch, logger);
    if (!result) {
      // logger already logged the specific reason in extractArticle/safeFetch
      return c.json({ detail: "Failed to extract content from URL" }, 422);
    }
    return c.json(result);
  } catch (err) {
    if (err instanceof UnsafeURLError) {
      logger.warn({ url, error: err.message }, "unsafe URL rejected");
      return c.json({ detail: "URL points to a private or reserved address" }, 400);
    }
    throw err;
  }
});
```

### 6.7 `api/src/middleware/error-handler.ts` — 構造化エラーログ

```typescript
export function errorHandler(err: Error, c: Context<AppEnv>): Response {
  const logger = c.get("logger") ?? rootLogger;

  if (err instanceof HTTPException) {
    return c.json({ detail: err.message }, err.status);
  }

  const pgCode = getPgErrorCode(err);
  if (pgCode) {
    if (pgCode === PG_UNIQUE_VIOLATION) {
      return c.json({ detail: "Resource conflict" }, 409);
    }
    if (pgCode.startsWith("23")) {
      const pgMessage = getPgErrorMessage(err);
      logger.error({ pgCode, pgMessage: pgMessage ?? err.message }, "PostgreSQL constraint error");
      return c.json({ detail: "Data integrity error" }, 422);
    }
  }

  logger.error({ err }, "unhandled error");
  return c.json({ detail: "Internal server error" }, 500);
}
```

### 6.8 Background Services

`article-monitor.ts` と `sse-broker.ts` はリクエストコンテキスト外で動作するため、root logger の child を直接使用:

```typescript
// article-monitor.ts
import { rootLogger } from "../lib/logger.js";
const logger = rootLogger.child({ service: "article-monitor" });

// sse-broker.ts
import { rootLogger } from "../lib/logger.js";
const logger = rootLogger.child({ service: "sse-broker" });
```

## 7. Log Level Guidelines

| Level | 用途 | 例 |
|-------|------|-----|
| `error` | 想定外のエラー、要対応 | unhandled error, DB 制約違反 |
| `warn` | 想定内の失敗、調査が必要かも | 非 200 レスポンス, Readability parse 失敗, unsafe URL |
| `info` | 正常な操作の記録 | request start/end, extraction success, startup |
| `debug` | 詳細なデバッグ情報 | redirect follow, fetch body length, DNS resolution |

**推奨設定**:
- 開発: `LOG_LEVEL=debug`
- 本番: `LOG_LEVEL=info`
- トラブルシュート: `LOG_LEVEL=debug` に一時変更

## 8. Output Examples

### Production (JSON lines)

```json
{"level":30,"time":1709600000000,"requestId":"a1b2c3","method":"POST","path":"/ingest","msg":"request started"}
{"level":30,"time":1709600000010,"requestId":"a1b2c3","method":"POST","path":"/ingest","service":"ingest","url":"https://example.com/article","msg":"extraction started"}
{"level":40,"time":1709600001200,"requestId":"a1b2c3","method":"POST","path":"/ingest","service":"safe-fetch","url":"https://example.com/article","status":403,"msg":"non-200 response"}
{"level":40,"time":1709600001201,"requestId":"a1b2c3","method":"POST","path":"/ingest","service":"ingest","url":"https://example.com/article","msg":"failed to fetch HTML"}
{"level":40,"time":1709600001202,"requestId":"a1b2c3","method":"POST","path":"/ingest","status":422,"duration":1202,"msg":"request completed"}
```

### Development (pino-pretty)

```
[14:30:00.000] INFO (a1b2c3): request started
    method: "POST"
    path: "/ingest"
[14:30:01.200] WARN (a1b2c3): non-200 response
    service: "safe-fetch"
    url: "https://example.com/article"
    status: 403
[14:30:01.202] WARN (a1b2c3): request completed
    status: 422
    duration: 1202
```

## 9. Test Strategy

- テスト時は `LOG_LEVEL=silent` を設定してログ出力を抑制
- `extractArticle` のテストは既存の `fetcher` mock に加え、`logger` パラメータは省略可能（デフォルトで rootLogger が使われる）
- 後方互換性: `logger` パラメータはすべて optional なので既存テストはそのまま動作

```typescript
// vitest.config.ts (or test setup)
process.env.LOG_LEVEL = "silent";
```

## 10. Migration Steps

1. `pino` / `pino-pretty` をインストール
2. `lib/logger.ts`, `types.ts`, `middleware/request-logger.ts` を新規作成
3. `index.ts` に request-logger middleware を追加
4. 全 `new Hono()` に `<AppEnv>` 型パラメータを追加
5. `safe-fetch.ts` に全失敗パスのログを追加
6. `ingest-service.ts` に抽出段階ログを追加
7. 各ルートハンドラで `c.get('logger')` を使用
8. `error-handler.ts` を構造化ログに移行
9. Background services (article-monitor, sse-broker) を child logger に移行
10. 残存する `console.*` をすべて除去
11. テスト実行 → `LOG_LEVEL=silent` で全テスト pass を確認

## 11. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`, `silent`) |
| `ENVIRONMENT` | `development` | 既存。`development` 時のみ pino-pretty を有効化 |

## 12. Non-Goals (Scope外)

- ログ集約基盤 (ELK, CloudWatch) の設定
- ログローテーション (Docker / systemd に委譲)
- パフォーマンスメトリクス (Prometheus/OpenTelemetry は別設計)
- リクエストボディのログ出力 (セキュリティ上除外)
