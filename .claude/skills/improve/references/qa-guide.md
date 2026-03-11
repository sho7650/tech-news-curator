# QA Phase Detailed Guide

## Parsing Output by QA Tool

### Biome Lint

**Command**:
```bash
cd api && npx biome check src/ 2>&1
```

**Parsing rules**:
- Format: `filepath:line:col category` = 1 issue
- Severity mapping: error → HIGH, warning → MEDIUM, info → LOW

**Example output**:
```
api/src/services/article-service.ts:45:3 lint/suspicious/noExplicitAny ━━━━━━━━
  ✖ Unexpected any. Specify a different type.
```






### TypeScript Type Check

**Command**:
```bash
cd api && npx tsc --noEmit 2>&1
```

**Parsing rules**:
- Format: `filepath(line,col): error TSxxxx: message`
- Severity: always HIGH (type errors mean compilation failure)

**Example output**:
```
src/services/digest-service.ts(23,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```




### Vitest (Unit Tests)

**Command**:
```bash
cd api && npm test 2>&1
```

Look for these failure indicators in test output:
- Lines containing `FAIL` (test file failures)
- `error TS[0-9]` (TypeScript compilation errors)
- `SyntaxError`, `ParseError`, `Cannot find module` (code errors)
- `beforeAll`/`beforeEach` errors in stack traces (setup failures)

Summary line format: `Tests  N failed | M passed (T)` or `Test Files  N failed | M passed (T)`

When tests fail, extract:
1. The failing test file path
2. The test name/description
3. The assertion error or exception message
4. The stack trace pointing to source code

### Severity Classification

- CRITICAL: Security vulnerability (injection, SSRF, auth bypass, etc.)
- HIGH: Likely bug, lack of type safety, test failure, compilation error
- MEDIUM: Coding convention violation, readability issue
- LOW: Style improvement suggestion, performance hint

## Code Review Checklist

- [ ] No unjustified use of unsafe types (any, unknown casts, etc.)
- [ ] Error handling: async operations have proper error handling
- [ ] External input is validated
- [ ] No hardcoded magic numbers or strings
- [ ] Functions are within 50 lines
- [ ] Files are within 300 lines
- [ ] No circular imports/dependencies
- [ ] No unjustified `any` type
- [ ] SSRF protection for external URL fetching
- [ ] Input validation on all endpoints
- [ ] Proper auth middleware
- [ ] No secrets in client-side code
- [ ] XSS prevention

## Issue Aggregation Template

```markdown
# Issues - Round N

**Date**: YYYY-MM-DD HH:MM
**Found**: X issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0
**Sources**: lint=a, typecheck=b, unit-test=c, e2e=d, review=e

## Issues

### [HIGH] Example issue title
- **File**: `path/to/file:line`
- **Source**: lint | typecheck | unit-test | e2e | review
- **Detail**: Description of the problem
- **Suggestion**: Proposed fix (if any)
- **Status**: open
```
