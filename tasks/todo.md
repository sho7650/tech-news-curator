# Logging System Implementation Workflow

**Design Doc**: `docs/DESIGN-logging.md` v1.0
**Branch**: `feat/structured-logging` (from `main`)

---

## Phase 1: Foundation

- [x] **1.1** Install `pino` and `pino-pretty`
- [x] **1.2** Create `api/src/lib/logger.ts` — root Pino logger, AppLogger type
- [x] **1.3** Create `api/src/types.ts` — `AppEnv` type with `Variables: { logger }`
- [x] **Checkpoint**: `tsc --noEmit` passes

---

## Phase 2: Infrastructure

- [x] **2.1** Create `api/src/middleware/request-logger.ts` — requestId, child logger, timing, X-Request-Id header
- [x] **2.2** Update `api/src/index.ts` — wire requestLogger middleware, replace console.* → rootLogger
- [x] **Checkpoint**: `tsc --noEmit` passes

---

## Phase 3: Critical Path — Ingest Bug Fix

- [x] **3.1** Update `api/src/services/safe-fetch.ts` — add logger param, log all failure paths
- [x] **3.2** Update `api/src/services/ingest-service.ts` — add logger param, extraction stage logs
- [x] **3.3** Update `api/src/routes/ingest.ts` — `Hono<AppEnv>`, pass logger to extractArticle

---

## Phase 4: Remaining Migration

- [x] **4.1** Update `api/src/middleware/error-handler.ts` — structured error logging
- [x] **4.2** Update all routes with `<AppEnv>` type parameter (articles, sources, digest, feed, health, sse)
- [x] **4.3** Update background services (article-monitor, sse-broker) — child loggers

---

## Phase 5: Cleanup & Verification

- [x] **5.1** Add `LOG_LEVEL=silent` to test setup
- [x] **5.2** `tsc --noEmit` — passes
- [x] **5.3** `biome check src/` — passes (auto-fixed)
- [x] **5.4** `npm test` — 146 tests pass, 15 files, no log noise
- [x] **5.5** `grep console.* api/src/` — zero remaining calls
- [ ] **5.6** Commit

---

## Files Changed

| Action | File |
|--------|------|
| **NEW** | `api/src/lib/logger.ts` |
| **NEW** | `api/src/types.ts` |
| **NEW** | `api/src/middleware/request-logger.ts` |
| MODIFY | `api/src/index.ts` |
| MODIFY | `api/src/middleware/error-handler.ts` |
| MODIFY | `api/src/routes/ingest.ts` |
| MODIFY | `api/src/routes/articles.ts` |
| MODIFY | `api/src/routes/sources.ts` |
| MODIFY | `api/src/routes/digest.ts` |
| MODIFY | `api/src/routes/feed.ts` |
| MODIFY | `api/src/routes/health.ts` |
| MODIFY | `api/src/routes/sse.ts` |
| MODIFY | `api/src/services/safe-fetch.ts` |
| MODIFY | `api/src/services/ingest-service.ts` |
| MODIFY | `api/src/services/article-monitor.ts` |
| MODIFY | `api/src/services/sse-broker.ts` |
| MODIFY | `api/tests/setup.ts` |
| MODIFY | `api/package.json` |
