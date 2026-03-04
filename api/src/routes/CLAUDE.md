# Routes Module

HTTP endpoint definitions using Hono's routing API.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Route aggregation — mounts all sub-routers |
| `articles.ts` | Article CRUD, search, and filtering endpoints |
| `digest.ts` | Daily digest generation and retrieval |
| `feed.ts` | RSS feed output (Atom/RSS) |
| `health.ts` | Health check endpoint (`GET /health`) |
| `ingest.ts` | Content ingestion from n8n (`POST /ingest`) |
| `sources.ts` | Source management CRUD |
| `sse.ts` | Server-Sent Events for real-time updates |

## Conventions

- Each route file exports a Hono app instance
- Request validation uses `@hono/zod-validator` with schemas from `../schemas/`
- Routes delegate business logic to services — no DB queries in route handlers
- All routes go through middleware stack: auth → rate-limit → security-headers
