# System Architecture

## Overview

Tech News Curator is a news aggregation system that collects, translates, and summarizes foreign tech news for delivery in Japanese. The system consists of three Docker services orchestrated externally by n8n.

## Service Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   n8n        │────>│  news-api        │────>│  news-db          │
│  (external)  │     │  Hono + Node.js  │     │  PostgreSQL 16    │
│              │     │  port 8100       │     │  port 5432        │
└──────────────┘     └──────────────────┘     └───────────────────┘
                            │
                            │ Internal Docker network
                            v
                     ┌──────────────────┐
                     │  news-frontend   │
                     │  Next.js 16      │
                     │  port 3100       │
                     └──────────────────┘
```

### n8n (External Orchestrator)

- RSS feed fetching and scheduling
- Article deduplication
- Translation via Ollama
- Summarization
- Pushes processed articles to `POST /ingest`

### news-api (Hono + Node.js)

- Receives ingested articles from n8n
- Content extraction via @mozilla/readability + linkedom
- Serves JSON API to frontend
- SSE for real-time article updates
- RSS feed generation

### news-frontend (Next.js 16)

- All pages are Server Components
- Data fetching happens server-side via `API_URL` (internal Docker network)
- No client-side fetching or `NEXT_PUBLIC_` environment variables

### news-db (PostgreSQL 16)

- Stores articles, digests, and sources
- UUID primary keys with `gen_random_uuid()`
- All timestamps in UTC (TIMESTAMPTZ)

## API Layer Structure (`api/src/`)

```
api/src/
├── routes/        HTTP endpoints (Hono routes)
│   ├── articles.ts    Article CRUD + search
│   ├── digest.ts      Daily digest generation
│   ├── feed.ts        RSS feed output
│   ├── health.ts      Health check endpoint
│   ├── index.ts       Route aggregation
│   ├── ingest.ts      Content ingestion from n8n
│   ├── sources.ts     Source management
│   └── sse.ts         Server-Sent Events
│
├── services/      Business logic and DB queries
│   ├── article-service.ts    Article CRUD operations
│   ├── article-monitor.ts    Article change monitoring (SSE)
│   ├── digest-service.ts     Digest generation
│   ├── ingest-service.ts     Content extraction + storage
│   ├── rss-service.ts        RSS feed generation
│   ├── source-service.ts     Source management
│   ├── sse-broker.ts         SSE client management
│   ├── safe-fetch.ts         SSRF-safe HTTP client
│   └── url-validator.ts      URL validation (SSRF protection)
│
├── schemas/       Zod request/response validation
├── middleware/     Cross-cutting concerns
│   ├── auth.ts              API key authentication
│   ├── error-handler.ts     Global error handler + getPgErrorCode()
│   ├── rate-limit.ts        Rate limiting (hono-rate-limiter)
│   └── security-headers.ts  Security headers (CSP, etc.)
│
└── db/
    ├── schema/    Drizzle ORM table definitions
    │   ├── articles.ts
    │   ├── digests.ts
    │   ├── sources.ts
    │   └── index.ts
    └── migrations/  SQL migrations (drizzle-kit generated)
```

## Request Flow

```
Client Request
  → Hono Router (routes/)
    → Middleware Stack (auth → rate-limit → security-headers)
      → Service Layer (services/)
        → Database (Drizzle ORM + postgres.js → PostgreSQL)
```

## Key Design Decisions

- **SSRF Protection**: Custom `url-validator.ts` + `safe-fetch.ts` validate all external URLs
- **Copyright Compliance**: Public endpoints return `summary_ja` + source link only; `body_original` and `body_translated` are stored but excluded from public responses
- **SSE Architecture**: EventEmitter + Map-based client tracking via `sse-broker.ts`
- **Error Handling**: Drizzle ORM wraps PG errors in `DrizzleQueryError`; use `getPgErrorCode()` to access error codes

## Infrastructure

- **Docker Compose**: Dev (`docker-compose.dev.yml`) and prod (`docker-compose.prod.yml`) configurations
- **Container Registry**: `${REGISTRY}/news-curator/{api,frontend}:latest`
- **Releases**: release-please with Conventional Commits, separate changelogs for api and frontend
