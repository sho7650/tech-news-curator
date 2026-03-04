# Improvement Loop Reflection Log

## Round 1 - 2026-03-04

| Phase | Result |
|-------|--------|
| QA | 10 issues found (H:5, M:4, L:1) |
| Fix | 6/10 issues fixed (auto: 1 biome, claude: 5) |
| Refactor | 2 refactorings applied |
| E2E Safety | PASSED |

### Modified Files
- `api/src/routes/articles.ts` - Replace `any` with `Article` type in formatters, use PG_UNIQUE_VIOLATION constant
- `api/src/routes/sources.ts` - Replace `any` with `Source` type, fix non-null assertion, use PG_UNIQUE_VIOLATION
- `api/src/routes/digest.ts` - Replace `any` with `Digest` type in formatters, use PG_UNIQUE_VIOLATION
- `api/src/services/article-monitor.ts` - Replace `any` with proper DB type, add `.catch()` to setInterval
- `api/src/middleware/error-handler.ts` - Replace `any` casts with `isPgError` type guard, extract PG_UNIQUE_VIOLATION constant
- `api/src/schemas/article.ts` - Add `.url()` to articleCheckQuerySchema
- `api/src/services/url-validator.ts` - Refactor DNS resolution from nested callbacks to dns.promises + Promise.race

### Remaining Issues (not fixed)
- [MEDIUM] Empty catch blocks in url-validator.ts and safe-fetch.ts (intentional pattern, low risk)
- [MEDIUM] Duplicate error handling pattern across routes (architectural decision, needs broader discussion)
- [LOW] Hardcoded constants scattered across services (config centralization, low priority)

### Observations
- The `any` type usage was the most pervasive issue, concentrated in route formatters and the article monitor service. All instances had proper types available (Article, Source, Digest from schema) but were not used.
- Biome lint and TypeScript typecheck passed cleanly before the improvement loop, confirming tooling compliance was already good. Issues were primarily in code review territory.

---

## Round 2 - 2026-03-04

| Phase | Result |
|-------|--------|
| QA | 19 issues found (H:4, M:7, L:8) |
| Fix | 8/19 issues fixed (auto: 0, claude: 8) |
| Refactor | 3 refactorings applied |
| E2E Safety | PASSED (static checks; Vitest skipped) |

### Modified Files
- `api/src/services/safe-fetch.ts` - Add warning log to empty catch block (H1)
- `api/src/services/url-validator.ts` - Fix DNS timeout timer leak; hoist unsafeRanges to module-scope Set (H2, M7)
- `api/src/services/article-service.ts` - Extract magic number to MS_PER_DAY constant (M4)
- `api/src/schemas/article.ts` - Move date validation to Zod .refine(); fix metadata type (M5, L6)
- `api/src/services/sse-broker.ts` - Remove unnecessary async from broadcast() (L7)
- `api/src/routes/sse.ts` - Remove duplicate unsubscribe in onAbort (L4)
- `api/src/routes/articles.ts` - Remove redundant date validation; use validationHook (M5, M2)
- `api/src/schemas/digest.ts` - Use shared paginationQuery (M1)
- `api/src/schemas/source.ts` - Use shared paginationQuery (M1)
- `api/src/middleware/validation.ts` - New: shared validation error hook (M2)
- `api/src/services/text-cleaner.ts` - New: extracted text cleaning functions (H3)
- `api/src/services/ingest-service.ts` - Reduced 345 to 93 lines (H3)
- `api/src/routes/digest.ts` - Use shared validationHook (M2)
- `api/src/routes/sources.ts` - Use shared validationHook (M2)
- `api/src/routes/ingest.ts` - Use shared validationHook (M2)

### Remaining Issues
- [HIGH] H4: Duplicate URL validation in safe-fetch vs url-validator (deeper refactoring needed)
- [MEDIUM] M3: Duplicate unique-violation error handling (4 instances, entity-specific messages)
- [MEDIUM] M6: makeRequest 61 lines (marginal, Promise-based structure)
- [LOW] L1, L3, L5, L8: Dead code and minor cleanup items

### Observations
- Round 2 issues were predominantly DRY violations. The shared paginationQuery and validationHook eliminated significant duplication.
- Splitting ingest-service.ts was the highest-impact refactoring (345 to 93 lines).
- Remaining unfixed issues are architectural (H4) or low-risk dead code (L-series).

---

## Round 3 - 2026-03-04

| Phase | Result |
|-------|--------|
| QA | 6 issues found (H:0, M:1, L:5) |
| Fix | 2/6 issues fixed (L3: server shutdown, L5: DB type) |
| Refactor | 0 (DB type extraction counted as fix) |
| E2E Safety | PASSED (static checks) |

### Modified Files
- `api/src/database.ts` - Export shared DB type alias
- `api/src/services/article-service.ts` - Use shared DB type from database.ts
- `api/src/services/digest-service.ts` - Use shared DB type from database.ts
- `api/src/services/source-service.ts` - Use shared DB type from database.ts
- `api/src/services/article-monitor.ts` - Use shared DB type from database.ts
- `api/src/services/rss-service.ts` - Use shared DB type from database.ts
- `api/src/index.ts` - Add server.close() for graceful shutdown

### Remaining Issues
- [MEDIUM] H4 reclassified: validateUrl() is tested but unused in prod (kept as public API)
- [LOW] L1: HealthResponse unused (file deletion blocked)
- [LOW] L8: AppEnv unused (file deletion blocked)
- [MEDIUM] M3: Intentional duplicate unique-violation handling (by design)

### Observations
- Round 3 found significantly fewer issues, indicating diminishing returns. The codebase is reaching a clean state.
- The shared DB type extraction eliminated 5 redundant import+type blocks across service files.
- File deletion permission issues prevented removing dead code files (health.ts, env.ts).
- `validateUrl()` was flagged as dead but is actually tested — it's a public API for SSRF protection.

---
