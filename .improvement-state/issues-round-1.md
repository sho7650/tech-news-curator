# Issues - Round 1

**Found**: 13 issues | **Severity**: CRITICAL=0, HIGH=4, MEDIUM=9, LOW=0
**Note**: Vitest skipped (permission denied). Biome: clean. TypeScript: clean.

## Issues

### [HIGH] #1 Graceful shutdown — queryClient.end() promise not caught
- **File**: `src/index.ts:64`
- **Source**: code-analysis
- **Detail**: `queryClient.end()` has no `.catch()` — if pool drain fails, process hangs forever
- **Suggestion**: Add `.catch()` or use async/await with try/finally to ensure process.exit always runs
- **Status**: open

### [HIGH] #2 deactivateSource return not null-guarded — runtime TypeError
- **File**: `src/routes/sources.ts:97-98`
- **Source**: code-analysis
- **Detail**: `deactivateSource` returns `Source | undefined`. Route passes result to `formatSourceResponse` without checking for undefined → TypeError. TOCTOU race between existence check and deactivate.
- **Suggestion**: Check `deactivated ?? null` and return 404 if undefined
- **Status**: open

### [HIGH] #3 Rate limiter trusts X-Forwarded-For without proxy validation
- **File**: `src/middleware/rate-limit.ts:10`
- **Source**: code-analysis
- **Detail**: Client-controlled header used as rate-limit key. Trivially bypassable.
- **Suggestion**: Use last hop or X-Real-IP with trusted proxy validation
- **Status**: open

### [HIGH] #4 HSTS sent unconditionally including over HTTP in dev
- **File**: `src/middleware/security-headers.ts:9`
- **Source**: code-analysis
- **Detail**: HSTS applied in all environments. Browsers cache 2-year policy even from dev HTTP.
- **Suggestion**: Gate behind `config.environment === 'production'`
- **Status**: open

### [MEDIUM] #5 No UUID/date validation on path parameters
- **File**: `src/routes/articles.ts:81`, `src/routes/sources.ts:69,92`, `src/routes/digest.ts:58`
- **Source**: code-analysis
- **Detail**: Path params passed to DB queries without format validation → unhandled 500 on malformed input
- **Suggestion**: Add `zValidator("param", ...)` with UUID/date schemas
- **Status**: open

### [MEDIUM] #6 og_image_url missing .url() format check
- **File**: `src/schemas/article.ts:15`
- **Source**: code-analysis
- **Detail**: `z.string().max(2083).nullish()` accepts arbitrary strings unlike other URL fields
- **Suggestion**: Add `.url()` validator
- **Status**: open

### [MEDIUM] #7 Record<string, unknown> bypasses Drizzle type safety
- **File**: `src/services/source-service.ts:49`
- **Source**: code-analysis
- **Detail**: Partial update uses `Record<string, unknown>` — typos in key names silently ignored
- **Suggestion**: Use `Partial<typeof sources.$inferInsert>`
- **Status**: open

### [MEDIUM] #8 digest_date path param not validated
- **File**: `src/routes/digest.ts:58-59`
- **Source**: code-analysis
- **Detail**: Invalid dates cause unhandled DB errors. Body schema validates but path param does not.
- **Suggestion**: Add date format validation on path parameter
- **Status**: open

### [MEDIUM] #9 SSEBroker nextId counter has no overflow protection
- **File**: `src/services/sse-broker.ts:21,30`
- **Source**: code-analysis
- **Detail**: Counter increments indefinitely, loses precision after MAX_SAFE_INTEGER
- **Suggestion**: Add modulo rollover
- **Status**: open

### [MEDIUM] #10 startMonitor can create duplicate intervals
- **File**: `src/services/article-monitor.ts:48-54`
- **Source**: code-analysis
- **Detail**: Calling startMonitor twice overwrites interval handle without clearing first
- **Suggestion**: Add guard to clear existing interval before creating new one
- **Status**: open

### [MEDIUM] #11 Non-null assertions suppress legitimate type narrowing
- **File**: `src/middleware/validation.ts:9`, `src/services/sse-broker.ts:60`, `src/services/url-validator.ts:44`
- **Source**: code-analysis
- **Detail**: `!` operators used where safer patterns exist
- **Suggestion**: Use optional chaining or proper initialization
- **Status**: open

### [MEDIUM] #12 AppEnv type defined but never used
- **File**: `src/types/env.ts`
- **Source**: code-analysis
- **Detail**: Dead code — exported type never applied to Hono app
- **Suggestion**: Remove file or integrate into app definition
- **Status**: open

### [MEDIUM] #13 Missing error handling on RSS feed generation
- **File**: `src/routes/feed.ts:8-14`
- **Source**: code-analysis
- **Detail**: No try/catch on generateRssFeed — DB error causes Content-Type mismatch
- **Suggestion**: Add try/catch returning appropriate error format
- **Status**: open
