# Tech News Curator

Foreign tech news aggregator — collects, translates, and summarizes articles into Japanese daily digests.

> **[日本語版 README はこちら](README.ja.md)**

## Overview

Tech News Curator is a three-service Docker application that provides the storage, extraction, and delivery layer for a tech news pipeline. An external **n8n** instance orchestrates the full workflow: RSS fetching, deduplication, content extraction, translation (via Ollama), summarization, and daily digest generation.

```
n8n (orchestrator)
 ├── RSS fetch → POST /articles/check (dedup)
 ├── POST /ingest (extract content via trafilatura)
 ├── Ollama (translate + summarize)
 ├── POST /articles (store)
 └── POST /digest (daily digest)

Docker Compose
 ├── news-db       (PostgreSQL 16)     :5432
 ├── news-api      (FastAPI)           :8100
 └── news-frontend (Next.js 16)        :3100
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Python 3.12, FastAPI 0.128, Pydantic 2.12, SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16, Alembic 1.18, asyncpg |
| Content extraction | trafilatura 2.0 |
| Frontend | Next.js 16.1, React 19.2, TypeScript 5, Tailwind CSS 4 |
| Testing | pytest 9, testcontainers (PostgreSQL), httpx 0.28 |

## Prerequisites

- Docker & Docker Compose v2
- Python 3.12+ (for running tests locally)
- Node.js 20+ (for frontend development outside Docker)

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
make test         # Run API tests (requires: pip install -r api/requirements-dev.txt)
make migrate msg="add column"   # Generate Alembic migration
make migrate-up                 # Apply migrations in running container
make push         # Push images to registry.oshiire.to
```

### Running a single test

```bash
cd api && python -m pytest tests/test_articles.py::test_create_article -v
```

## API Endpoints

| Method | Path | Purpose | Consumer |
|--------|------|---------|----------|
| `GET` | `/health` | Health check (DB connectivity) | Monitoring |
| `POST` | `/ingest` | Extract article from URL (trafilatura) | n8n |
| `GET` | `/articles/check?url=` | Deduplication check | n8n |
| `POST` | `/articles` | Create article | n8n |
| `GET` | `/articles?page=&per_page=&date=` | List articles (paginated) | Frontend |
| `GET` | `/articles/{id}` | Article detail | Frontend |
| `POST` | `/digest` | Create daily digest | n8n |
| `GET` | `/digest` | List digests | Frontend |
| `GET` | `/digest/{date}` | Digest by date (YYYY-MM-DD) | Frontend |

### Request/Response Examples

**Extract content:**
```bash
curl -X POST http://localhost:8100/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
# → {"title": "...", "body": "...", "author": "...", "published_at": "2026-01-01", "og_image_url": "..."}
```

**Create article:**
```bash
curl -X POST http://localhost:8100/articles \
  -H "Content-Type: application/json" \
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
├── app/
│   ├── main.py          # FastAPI app with lifespan
│   ├── config.py        # Settings (DATABASE_URL, ENVIRONMENT)
│   ├── database.py      # AsyncEngine, session factory, Base
│   ├── models/          # SQLAlchemy ORM (Article, Digest, Source)
│   ├── schemas/         # Pydantic v2 request/response models
│   ├── services/        # Business logic (article, digest, ingest)
│   └── routers/         # HTTP endpoints
├── alembic/             # Database migrations
└── tests/               # Integration tests (testcontainers)

frontend/src/
├── app/                 # Next.js pages (Server Components)
├── components/          # UI components (Header, Footer, Cards)
└── lib/                 # API client, TypeScript types
```

## Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | .env (host) | Database password (shared by all services) |
| `DATABASE_URL` | news-api | PostgreSQL connection string (asyncpg driver) |
| `ENVIRONMENT` | news-api | `development` or `production` |
| `API_URL` | news-frontend | Internal API URL (e.g. `http://news-api:8100`) |

## License

MIT License - sho kisaragi
