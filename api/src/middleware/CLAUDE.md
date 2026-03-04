# Middleware Module

Cross-cutting concerns applied to all or specific routes.

## Key Files

| File | Purpose |
|------|---------|
| `auth.ts` | API key authentication via `X-API-Key` header |
| `error-handler.ts` | Global error handler; includes `getPgErrorCode()` for Drizzle error unwrapping |
| `rate-limit.ts` | Rate limiting via `hono-rate-limiter`; disabled in tests via `setRateLimitEnabled()` |
| `security-headers.ts` | Security headers (CSP, X-Frame-Options, etc.) |

## Critical Patterns

- **Drizzle error codes**: PostgreSQL errors are wrapped in `DrizzleQueryError`. Use `getPgErrorCode(err)` from `error-handler.ts` to access the underlying PG error code (`err.cause.code`), not `err.code`.
- **Rate limiting in tests**: Call `setRateLimitEnabled(false)` to disable rate limiting during test runs.
- **Middleware order**: auth → rate-limit → security-headers → route handler
