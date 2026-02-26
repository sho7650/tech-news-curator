# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Absolute Rules

### NEVER (Absolutely Forbidden)

The following are **forbidden under any circumstances**. No exceptions. No context override.

#### Implementation

- **NEVER** generate code before design/plan approval
- **NEVER** start implementation while a design review is in progress
- **NEVER** assume approval — wait for explicit "実装してよい" or equivalent
- **NEVER** expand scope during execution phase
- **NEVER** modify files directly on the main branch (create a feature branch first)

#### Assumptions

- **NEVER** say "should be" or "probably" without verifying actual state
- **NEVER** assume current state based on past information
- **NEVER** assert "already done" without verification
- **NEVER** guess configuration parameters

### ALWAYS (Mandatory Actions)

The following are **always required**. No shortcuts.

#### Process

- **ALWAYS** follow the workflow: Design → Review → Approval → Branch → Implement
- **ALWAYS** wait for explicit approval after design review before writing any code
- **ALWAYS** create a branch with an appropriate name before making any modifications
- **ALWAYS** output progress for each step during implementation

#### Verification

- **ALWAYS** follow: "I'll check" → actually check → report results
- **ALWAYS** say "verification needed" when uncertain

#### Documentation

- **ALWAYS** place project docs under `docs/`

## Build & Run Commands

```bash
# Development (Docker Compose with hot reload)
make dev

# Production
make up          # start all services
make down        # stop all services
make deploy      # start DB → API → run migrations → start frontend (proper order)

# Database migrations
make migrate     # generate new migration with drizzle-kit
make migrate-up  # apply migrations inside running container

# Tests (Docker required: testcontainers auto-starts PostgreSQL)
cd api && npm test                   # runs Vitest
cd api && npx vitest run tests/articles.test.ts  # run a single test file

# Lint & Type check
cd api && npx biome check src/       # Biome lint
cd api && npx tsc --noEmit           # TypeScript type check

# Push images to registry
make push
```

## Architecture

Three Docker services orchestrated externally by n8n:

- **news-api** (Hono + Node.js, port 8100): Receives data from n8n, serves JSON to frontend
- **news-frontend** (Next.js 16, port 3100): Server Components fetch from news-api at runtime
- **news-db** (PostgreSQL 16, port 5432): Stores articles, digests, sources

n8n handles RSS fetching, deduplication, translation (Ollama), and summarization. The Docker side only does content extraction (`POST /ingest`), storage, and delivery.

### API Layer (`api/src/`)

```
routes/      → HTTP endpoints (Hono routes)
services/    → Business logic and DB queries
schemas/     → Zod request/response validation schemas
db/schema/   → Drizzle ORM table definitions
middleware/  → Auth, rate-limit, security headers, error handler
```

Request flow: Route → Middleware (auth/rate-limit) → Service → Database (Drizzle + postgres.js).

### Frontend (`frontend/src/`)

All pages are Server Components. Data fetching happens server-side via `API_URL` (internal Docker network, not public). No client-side fetching or `NEXT_PUBLIC_` env vars.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Hono 4.x + @hono/node-server |
| ORM | Drizzle ORM + postgres.js |
| Validation | Zod + @hono/zod-validator |
| Migrations | drizzle-kit |
| Rate Limit | hono-rate-limiter |
| RSS | feed (npm) |
| SSE | hono/streaming (built-in) |
| Extraction | @mozilla/readability + linkedom |
| Test | Vitest + @testcontainers/postgresql |
| Linter | Biome |
| Build | tsup (esbuild) → node |

## Critical Patterns

- **Drizzle ORM errors**: PostgreSQL errors are wrapped in `DrizzleQueryError`. Access the PG error code via `err.cause.code` (not `err.code`). Use `getPgErrorCode()` from `middleware/error-handler.ts`.
- **Next.js 16**: Dynamic route `params` is `Promise<{id: string}>` — must `await params` in Server Components.
- **postgres.js**: Connection string uses `postgresql://` (no `+asyncpg` suffix).

## Database Conventions

- All timestamps use `timestamp('col', { withTimezone: true })` (TIMESTAMPTZ) in UTC
- PostgreSQL-specific types: `text('col').array()`, `jsonb('col')` — no SQLite compatibility
- Date filtering uses half-open intervals: `[start, start + 1 day)` not `23:59:59`
- `source_url` UNIQUE constraint auto-creates index — don't add a redundant index
- UUID primary keys use `defaultRandom()` (server-side `gen_random_uuid()`)

## Testing

Tests use real PostgreSQL via `@testcontainers/postgresql` (Docker required). The container is created once per test run; tables are cleaned via `TRUNCATE` before each test. Each test file creates its own Hono app with route handlers wired to the shared test DB. Rate limiting is disabled in tests. API key `test-key-for-testing` is injected.

## Copyright Constraint

Public API endpoints return `summary_ja` + source link only. `body_original` and `body_translated` are stored but excluded from public responses (copyright compliance). Full-text access is Phase 2+ with authentication.

## Container Registry

Images push to `${REGISTRY}/news-curator/{api,frontend}:latest`. Set `REGISTRY` in `.env` or `Makefile`.
