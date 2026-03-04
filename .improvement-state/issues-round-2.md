# Issues - Round 2

**Found**: 19 issues | **Severity**: CRITICAL=0, HIGH=4, MEDIUM=7, LOW=8

## Issues

### [HIGH] H1: Empty catch silently swallows fetch errors in safe-fetch.ts
- **File**: `api/src/services/safe-fetch.ts:121`
- **Source**: review
- **Detail**: When `makeRequest()` throws, the error is silently swallowed and `null` returned. No way to distinguish failure modes.
- **Suggestion**: Add `console.warn()` before returning null
- **Status**: open

### [HIGH] H2: DNS timeout timer never cleared on success
- **File**: `api/src/services/url-validator.ts:37-44`
- **Source**: review
- **Detail**: `dnsTimeout()` creates a `setTimeout` that's never cancelled when DNS resolves first. Timer stays on event loop.
- **Suggestion**: Add `clearTimeout` via `.finally()` or wrap in helper
- **Status**: open

### [HIGH] H3: File exceeds 300-line guardrail (345 lines)
- **File**: `api/src/services/ingest-service.ts`
- **Source**: review
- **Detail**: 345 lines. Mixes HTML-to-Markdown, text cleaning (6+ functions), and extraction.
- **Suggestion**: Extract text-cleaning functions into `text-cleaner.ts`
- **Status**: open

### [HIGH] H4: Duplicate URL validation logic between safe-fetch and url-validator
- **File**: `api/src/services/safe-fetch.ts:12-38` and `api/src/services/url-validator.ts:60-98`
- **Source**: review
- **Detail**: Both files independently implement the same pattern: parse URL, check protocol, validate IP, resolve DNS, check each address.
- **Suggestion**: Have safe-fetch call validateUrl() from url-validator.ts
- **Status**: open

### [MEDIUM] M1: Pagination schema defined 3 times despite base.ts providing reusable one
- **File**: `api/src/schemas/base.ts`, `article.ts:22-25`, `digest.ts:15-17`, `source.ts:35-38`
- **Source**: review
- **Detail**: `paginationQuery` in base.ts is never imported. Each entity schema redefines page/per_page.
- **Suggestion**: Use `paginationQuery.extend()` in entity schemas
- **Status**: open

### [MEDIUM] M2: Duplicate validation error handler callbacks (9 instances)
- **File**: `articles.ts`, `digest.ts`, `sources.ts`, `ingest.ts` (all routes)
- **Source**: review
- **Detail**: Every `zValidator` call repeats identical error callback pattern.
- **Suggestion**: Create shared `validationHook` function
- **Status**: open

### [MEDIUM] M3: Duplicate unique-violation error handling (4 instances)
- **File**: `articles.ts:56-61`, `digest.ts:33-38`, `sources.ts:60-65,92-97`
- **Source**: review
- **Detail**: Same try/catch PG_UNIQUE_VIOLATION pattern repeated 4 times.
- **Suggestion**: Create helper or let global error handler manage it
- **Status**: open

### [MEDIUM] M4: Magic number 86400000 for milliseconds-per-day
- **File**: `api/src/services/article-service.ts:49`
- **Source**: review
- **Detail**: Hardcoded magic number. While commented, a named constant is clearer.
- **Suggestion**: Extract to `const MS_PER_DAY = 86_400_000`
- **Status**: open

### [MEDIUM] M5: Redundant date validation in articles.ts
- **File**: `api/src/routes/articles.ts:78-83`
- **Source**: review
- **Detail**: Manual date validation after Zod regex check provides false safety (JS Date rolls over invalid dates).
- **Suggestion**: Move proper validation into Zod schema with `.refine()`
- **Status**: open

### [MEDIUM] M6: makeRequest function is 61 lines (exceeds 50-line guardrail)
- **File**: `api/src/services/safe-fetch.ts:40-101`
- **Source**: review
- **Detail**: Function too long. Mixes URL parsing, options building, request, response, timeout, error handling.
- **Suggestion**: Extract options-building logic into helper
- **Status**: open

### [MEDIUM] M7: unsafeRanges array recreated on every isSafeIp call
- **File**: `api/src/services/url-validator.ts:22-31`
- **Source**: review
- **Detail**: Constant array allocated inside function on every invocation.
- **Suggestion**: Hoist to module scope as UNSAFE_IP_RANGES
- **Status**: open

### [LOW] L1: HealthResponse interface is unused
- **File**: `api/src/schemas/health.ts`
- **Source**: review
- **Detail**: Exported but never imported anywhere.
- **Status**: open

### [LOW] L2: paginationQuery in base.ts exported but never imported
- **File**: `api/src/schemas/base.ts`
- **Source**: review
- **Detail**: Dead code (will be fixed if M1 is addressed).
- **Status**: open

### [LOW] L3: shutdown() does not close HTTP server
- **File**: `api/src/index.ts:60-66`
- **Source**: review
- **Detail**: Server socket remains open during shutdown, in-flight requests not drained.
- **Status**: open

### [LOW] L4: SSE unsubscribe called twice (onAbort and finally)
- **File**: `api/src/routes/sse.ts:24,40`
- **Source**: review
- **Detail**: Double unsubscribe. Map.delete is idempotent but semantically misleading.
- **Status**: open

### [LOW] L5: DB type alias duplicated across 4 service files
- **File**: `article-service.ts:7`, `digest-service.ts:7`, `source-service.ts:7`
- **Source**: review
- **Detail**: Each service independently defines `type DB = PostgresJsDatabase<typeof schema>`
- **Status**: open

### [LOW] L6: ArticleDetail uses `unknown | null` instead of `Record<string, unknown> | null`
- **File**: `api/src/schemas/article.ts:63`
- **Source**: review
- **Detail**: `unknown | null` simplifies to `unknown`. Should match the Zod schema.
- **Status**: open

### [LOW] L7: broadcast() in SSE broker unnecessarily async
- **File**: `api/src/services/sse-broker.ts:39`
- **Source**: review
- **Detail**: No `await` in function body. Unnecessary Promise wrapping.
- **Status**: open

### [LOW] L8: AppEnv type defined but never used
- **File**: `api/src/types/env.ts`
- **Source**: review
- **Detail**: Exported but never referenced by any route or middleware.
- **Status**: open
