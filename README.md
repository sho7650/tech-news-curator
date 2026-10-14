# Tech News Curator

Foreign tech news aggregator — collects, translates, and summarizes articles into Japanese daily digests.

> **[日本語版 README はこちら](README.ja.md)**

## Overview

Tech News Curator is a three-service Docker application that provides the storage, extraction, and delivery layer for a tech news pipeline. An external **n8n** instance orchestrates the full workflow: RSS fetching, deduplication, content extraction, translation (via Ollama), summarization, and daily digest generation.

```
n8n (orchestrator)
 ├── RSS fetch → POST /articles/check (dedup)
 ├── POST /ingest (extract content via @mozilla/readability)
 ├── Ollama (translate + summarize)
 ├── POST /articles (store)
 └── POST /digest (daily digest)

Docker Compose
 ├── news-db       (PostgreSQL 16)     :5432
 ├── news-api      (Hono + Node.js)    :8100
 └── news-frontend (Next.js 16)        :3100
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Node.js 22, Hono 4.x, Drizzle ORM, Zod |
| Database | PostgreSQL 16, drizzle-kit (migrations) |
| Content extraction | @mozilla/readability + linkedom |
| Frontend | Next.js 16.3, React 19.2, TypeScript 5, Tailwind CSS 4 |
| Testing | Vitest, @testcontainers/postgresql |

## Prerequisites

- Docker & Docker Compose v2
- Node.js 22+ (for development outside Docker) — or use the [Nix dev shell](#nix-dev-shell-optional), which pins it for you

## Nix dev shell (optional)

A [Nix flake](flake.nix) provides a reproducible toolchain (Node 22 + `make`,
`psql`, `git`, `jq`) so you don't need `nvm`. With [direnv](https://direnv.net/):

```bash
direnv allow           # auto-loads the toolchain on cd into the repo
```

Or manually: `nix develop`. The database and tests still require Docker.
See [docs/NIX-DEVELOPMENT.md](docs/NIX-DEVELOPMENT.md) for details.

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD

# 2. Start development environment (with hot reload)
make dev

# Services:
#   API:      http://localhost:8100
#   Frontend: http://localhost:3100
#   DB:       localhost:5432
```

## Commands

```bash
make dev          # Development mode with hot reload (API + frontend)
make up           # Start production services (background)
make down         # Stop all services
make build        # Build Docker images
make deploy       # Production deploy: DB → API → migrations → frontend
make test         # Run API tests (Node.js + Docker required)
make test-e2e     # Run E2E tests with Playwright (Docker required)
make migrate      # Generate new Drizzle migration
make migrate-up   # Apply migrations in running container
make push         # Push images to container registry
```

### Running a single test

```bash
cd api && npm test                            # Run all tests
cd api && npx vitest run tests/articles.test.ts   # Run a single test file
make test-e2e                                 # E2E tests (requires API key from .env)
```

## API Endpoints

| Method | Path | Purpose | Consumer |
|--------|------|---------|----------|
| `GET` | `/health` | Health check (DB connectivity) | Monitoring |
| `POST` | `/ingest` | Extract article from URL (@mozilla/readability) | n8n |
| `GET` | `/articles/check?url=` | Deduplication check | n8n |
| `POST` | `/articles` | Create article | n8n |
| `GET` | `/articles?page=&per_page=&date=&category=` | List articles (paginated, summaries only) | Frontend |
| `GET` | `/articles/{id}` | Article detail (all stored fields) | Frontend |
| `GET` | `/articles/{id}/neighbors` | Previous / next article | Frontend |
| `GET` | `/articles/stream` | Server-Sent Events for new articles | Frontend |
| `POST` | `/digest` | Create daily digest | n8n |
| `GET` | `/digest` | List digests | Frontend |
| `GET` | `/digest/{date}` | Digest by date (YYYY-MM-DD) | Frontend |
| `GET` | `/digest/source-articles?date=` | Full article bodies for one JST day (digest input) | n8n |
| `GET` | `/sources?page=&per_page=&active_only=` | List sources | Frontend, n8n |
| `POST` | `/sources` | Create source | n8n |
| `PUT` | `/sources/{id}` | Update source | n8n |
| `DELETE` | `/sources/{id}` | Deactivate source | n8n |
| `GET` | `/feed/rss` | RSS feed of latest articles | Readers |

### Request/Response Examples

Write endpoints (`POST`, `PUT`, `DELETE`) require an `X-API-Key` header matching one of `API_KEYS`.

**Extract content:**
```bash
curl -X POST http://localhost:8100/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <key1>" \
  -d '{"url": "https://example.com/article"}'
# → {"title": "...", "body": "...", "author": "...", "published_at": "2026-01-01", "og_image_url": "..."}
```

**Create article:**
```bash
curl -X POST http://localhost:8100/articles \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <key1>" \
  -d '{
    "source_url": "https://example.com/article",
    "title_original": "Title",
    "title_ja": "タイトル",
    "summary_ja": "要約テキスト",
    "published_at": "2026-01-01T00:00:00Z"
  }'
# → 201 Created
```

**Check duplicate:**
```bash
curl "http://localhost:8100/articles/check?url=https://example.com/article"
# → {"exists": true}
```

## Project Structure

```
api/
├── src/
│   ├── index.ts         # Hono app entry point
│   ├── config.ts        # Settings (DATABASE_URL, ENVIRONMENT, CORS_ORIGINS, API_KEYS)
│   ├── database.ts      # Drizzle ORM client, postgres.js pool
│   ├── routes/          # HTTP endpoints (Hono routes)
│   ├── services/        # Business logic (article, digest, ingest, SSE)
│   ├── schemas/         # Zod validation schemas
│   ├── middleware/      # Auth, rate-limit, security headers, error handler
│   └── db/
│       ├── schema/      # Drizzle ORM table definitions
│       └── migrations/  # SQL migrations (drizzle-kit generated)
├── tests/               # Integration tests (Vitest + testcontainers)
└── package.json         # Scripts: dev, build, test, lint

frontend/src/
├── app/                 # Next.js pages (Server Components)
├── components/          # UI components (Header, Footer, Cards)
└── lib/                 # API client, TypeScript types
```

## Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | .env (host) | Database password (shared by all services) |
| `DATABASE_URL` | news-api | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db`) |
| `DATABASE_ADMIN_URL` | news-api | PostgreSQL admin URL (optional, for migrations) |
| `ENVIRONMENT` | news-api | `development`, `production`, `test`, or `staging` |
| `CORS_ORIGINS` | news-api | Comma-separated list of allowed CORS origins |
| `API_KEYS` | news-api | Comma-separated list of valid API keys for n8n |
| `PUBLIC_URL` | news-api | Public URL for the frontend (default: `http://localhost:3100`) |
| `FETCH_USER_AGENT` | news-api | User-Agent for outbound HTTP requests |
| `TRUSTED_PROXIES` | news-api | Comma-separated CIDRs of reverse proxies to trust for X-Real-IP/X-Forwarded-For (optional; empty means headers ignored) |
| `API_URL` | news-frontend | Internal API URL (e.g. `http://news-api:8100`) |

## Content Usage Notice

This system is designed for **personal / household use only** (個人的又は家庭内利用). Article content fetched, stored, and translated by this system is covered under Japanese Copyright Law Article 30 (私的使用のための複製) and Article 47-6 (翻訳等による利用). **Do not deploy this system on a publicly accessible network** without obtaining appropriate content licenses from the original publishers.

The article detail API endpoint (`GET /articles/{id}`) returns all stored fields including `body_original` and `body_translated`. The list endpoint and RSS feed return summaries only for payload size optimization.

## License

MIT License - sho kisaragi
