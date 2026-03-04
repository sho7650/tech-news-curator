# Services Module

Business logic and database operations using Drizzle ORM.

## Key Files

| File | Purpose |
|------|---------|
| `article-service.ts` | Article CRUD, search, date filtering |
| `article-monitor.ts` | Monitors article changes for SSE notifications |
| `digest-service.ts` | Daily digest generation and retrieval |
| `ingest-service.ts` | Content extraction (@mozilla/readability) + storage |
| `rss-service.ts` | RSS/Atom feed generation |
| `source-service.ts` | Source management CRUD |
| `sse-broker.ts` | SSE client tracking (EventEmitter + Map) |
| `safe-fetch.ts` | SSRF-safe HTTP client for external URLs |
| `url-validator.ts` | URL validation and SSRF protection |

## Conventions

- Services receive a Drizzle DB instance (dependency injection for testability)
- All DB queries use Drizzle ORM — no raw SQL unless justified
- Date filtering uses half-open intervals: `[start, start + 1 day)`
- Partial updates distinguish `undefined` (not sent) from `null` (explicit clear)
- External URL fetching must go through `safe-fetch.ts` for SSRF protection
