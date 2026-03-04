# QA Phase Detailed Guide

## Parsing Output by QA Tool

### Biome Lint

**Command**:
```bash
cd api && npx biome check src/ 2>&1
```

**Example output**:
```
api/src/services/article-service.ts:45:3 lint/suspicious/noExplicitAny ━━━━━━━━
  ✖ Unexpected any. Specify a different type.
```

**Parsing rules**:
- Format: `filepath:line:col category` = 1 issue
- Severity mapping: error → HIGH, warning → MEDIUM, info → LOW

### TypeScript Type Check

**Command**:
```bash
cd api && npx tsc --noEmit 2>&1
```

**Example output**:
```
src/services/digest-service.ts(23,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

**Parsing rules**:
- Format: `filepath(line,col): error TSxxxx: message`
- Severity: always HIGH (type errors mean compilation failure)

### Vitest

**Command**:
```bash
cd api && npm test 2>&1
```

**Example output**:
```
 FAIL  tests/articles.test.ts > GET /articles > should return articles
AssertionError: expected 200 to be 404
```

**Parsing rules**:
- Extract test file and test name from `FAIL` lines
- Extract failure reason from the error message
- Severity: always HIGH (test failure = regression bug)

### Playwright

**Command**:
```bash
cd frontend && npx playwright test 2>&1
```

**Example output**:
```
  1) [chromium] › e2e/home.spec.ts:5:3 › home page › should display header
     Timeout of 30000ms exceeded.
```

**Parsing rules**:
- Lines starting with `number)` indicate failing tests
- Extract browser name, test file, test name, and error reason
- Severity: always HIGH

### Claude Code Review

**Review target selection**:

Round 1:
1. `api/src/services/*.ts` — business logic
2. `api/src/routes/*.ts` — API endpoints
3. `api/src/middleware/*.ts` — middleware

Round 2+:
1. Files modified in the previous round
2. Files not yet reviewed (rotate each round)

**Review checklist**:
- [ ] No unjustified use of `any` type
- [ ] Async functions have try-catch or error handling
- [ ] External input validated with Zod schemas
- [ ] No hardcoded magic numbers or strings
- [ ] Functions are within 50 lines
- [ ] Files are within 300 lines
- [ ] No circular imports
- [ ] SSRF protection (external URL fetching uses safe-fetch.ts)
- [ ] Copyright compliance (body_original/body_translated not included in public responses)

**Severity classification**:
- CRITICAL: Security vulnerability (SSRF, injection, etc.)
- HIGH: Likely bug, lack of type safety, test failure
- MEDIUM: Coding convention violation, readability issue
- LOW: Style improvement suggestion, performance hint

## Issue Aggregation Template

```markdown
# Issues - Round N

**Date**: YYYY-MM-DD HH:MM
**Found**: X issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0
**Sources**: lint=a, typecheck=b, vitest=c, playwright=d, review=e

## Issues

### [HIGH] Missing error handling in digest-service
- **File**: `api/src/services/digest-service.ts:45`
- **Source**: review
- **Detail**: generateDigest() calls external API without try-catch
- **Suggestion**: Add try-catch + error logging
- **Status**: open

### [MEDIUM] Unused import
- **File**: `api/src/routes/articles.ts:3`
- **Source**: lint
- **Detail**: 'zValidator' is imported but never used
- **Suggestion**: Remove import (auto-fixable with biome --write)
- **Status**: open
```
