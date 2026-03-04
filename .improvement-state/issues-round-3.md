# Issues - Round 3

**Found**: 6 issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=1, LOW=5

## Issues

### [MEDIUM] H4 reclassified: validateUrl() is dead code
- **File**: `api/src/services/url-validator.ts:61-99`
- **Source**: review
- **Detail**: `validateUrl()` is exported but never imported anywhere. resolveAndValidate() in safe-fetch.ts handles all validation.
- **Suggestion**: Remove the unused function
- **Status**: open

### [LOW] L1: HealthResponse interface unused
- **File**: `api/src/schemas/health.ts`
- **Source**: review
- **Detail**: Never imported. Health route uses inline object.
- **Suggestion**: Delete file
- **Status**: open

### [LOW] L3: shutdown() doesn't close HTTP server
- **File**: `api/src/index.ts:60-66`
- **Source**: review
- **Detail**: server.close() not called before process.exit
- **Suggestion**: Close server in shutdown function
- **Status**: open

### [LOW] L5: DB type duplicated across 5 service files
- **File**: `article-service.ts`, `source-service.ts`, `digest-service.ts`, `article-monitor.ts`, `rss-service.ts`
- **Source**: review
- **Detail**: Each file independently defines `type DB = PostgresJsDatabase<typeof schema>`
- **Suggestion**: Export from database.ts
- **Status**: open

### [LOW] L8: AppEnv type unused
- **File**: `api/src/types/env.ts`
- **Source**: review
- **Detail**: Never imported anywhere
- **Suggestion**: Delete file
- **Status**: open

### [LOW] M3 reclassified: Duplicate unique-violation handling (intentional)
- **File**: `articles.ts`, `digest.ts`, `sources.ts`
- **Source**: review
- **Detail**: Each route provides entity-specific error message. Global handler is fallback. This is intentional design.
- **Status**: wont-fix (by design)
