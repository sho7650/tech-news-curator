# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Development (Docker Compose with hot reload)
make dev

# Production
make up          # start all services
make down        # stop all services
make deploy      # start DB → API → run migrations → start frontend (proper order)

# Database migrations
make migrate msg="description"   # generate new migration
make migrate-up                  # apply migrations inside running container

# Tests (run from host - requires local Python + dev deps)
cd api && pip install -r requirements-dev.txt
make test                        # runs pytest in api/

# Run a single test
cd api && python -m pytest tests/test_articles.py::test_create_article -v

# Push images to registry
make push
```

## Architecture

Three Docker services orchestrated externally by n8n:

- **news-api** (FastAPI, port 8100): Receives data from n8n, serves JSON to frontend
- **news-frontend** (Next.js 16, port 3100): Server Components fetch from news-api at runtime
- **news-db** (PostgreSQL 16, port 5432): Stores articles, digests, sources

n8n handles RSS fetching, deduplication, translation (Ollama), and summarization. The Docker side only does content extraction (`POST /ingest`), storage, and delivery.

### API Layer (`api/app/`)

```
routers/   → HTTP endpoints (FastAPI router)
services/  → Business logic and DB queries
schemas/   → Pydantic v2 request/response models
models/    → SQLAlchemy 2.0 ORM models
```

Request flow: Router → Service → Database. Routers depend on `Depends(get_session)` for async DB sessions.

### Frontend (`frontend/src/`)

All pages are Server Components. Data fetching happens server-side via `API_URL` (internal Docker network, not public). No client-side fetching or `NEXT_PUBLIC_` env vars.

## Critical Version-Specific Patterns

These patterns differ from older tutorials/docs. Using outdated patterns will break things:

- **trafilatura 2.0**: `bare_extraction()` returns a `Document` object, not a dict. Access fields as attributes (`.title`, `.text`).
- **httpx 0.28+**: No `app=` parameter. Use `AsyncClient(transport=ASGITransport(app=app), base_url="http://test")`.
- **pytest-asyncio 1.3+**: No `event_loop` fixture. `asyncio_mode = "auto"` in pyproject.toml handles everything.
- **Pydantic v2**: `ConfigDict(from_attributes=True)` not `orm_mode`. `BaseSettings` lives in `pydantic_settings`.
- **SQLAlchemy 2.0**: `Mapped[type]` + `mapped_column()` pattern. `expire_on_commit=False` required for async sessions.
- **Next.js 16**: Dynamic route `params` is `Promise<{id: string}>` — must `await params` in Server Components.
- **FastAPI**: Use `lifespan` context manager, not deprecated `@app.on_event`.

## Database Conventions

- All timestamps use `DateTime(timezone=True)` (TIMESTAMPTZ) in UTC
- PostgreSQL-specific types: `ARRAY(Text)`, `JSONB` — no SQLite compatibility
- Date filtering uses half-open intervals: `[start, start + 1 day)` not `23:59:59`
- `source_url` UNIQUE constraint auto-creates index — don't add a redundant index
- `metadata_` Python attribute maps to `metadata` column (reserved word avoidance)

## Testing

Tests use real PostgreSQL via testcontainers (not SQLite). The container is session-scoped; tables are recreated per test function via `create_all`/`drop_all`. DB sessions are injected through `app.dependency_overrides[get_session]`. Test engines use `NullPool`.

## Copyright Constraint

Public API endpoints return `summary_ja` + source link only. `body_original` and `body_translated` are stored but excluded from public responses (copyright compliance). Full-text access is Phase 2+ with authentication.

## Container Registry

Images push to `${REGISTRY}/news-curator/{api,frontend}:latest`. Set `REGISTRY` in `.env` or `Makefile`.
