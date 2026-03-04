# Local Development Setup

## Prerequisites

- Docker Desktop (required for PostgreSQL via testcontainers)
- Node.js 22.x
- npm

## Quick Start

```bash
# Clone and enter the project
git clone <repository-url>
cd tech-news-curator

# Start all services with hot reload
make dev
```

This starts:
- **news-db** (PostgreSQL 16) on port 5432
- **news-api** (Hono) on port 8100 with hot reload
- **news-frontend** (Next.js 16) on port 3100 with hot reload

## Running Tests

```bash
# Run all API tests (Docker required for testcontainers)
cd api && npm test

# Run a single test file
cd api && npx vitest run tests/articles.test.ts

# Run E2E tests
cd frontend && npx playwright test

# Run E2E tests with UI
cd frontend && npx playwright test --ui
```

## Linting & Type Checking

```bash
# Biome lint
cd api && npx biome check src/

# TypeScript type check
cd api && npx tsc --noEmit
```

## Database

```bash
# Generate a new migration
make migrate

# Apply migrations (inside running container)
make migrate-up
```

## Common Issues

### Port conflicts

If ports 5432, 8100, or 3100 are already in use, stop conflicting services or modify `docker-compose.yml`.

### Test container startup

Tests use `@testcontainers/postgresql` which requires Docker to be running. If tests fail to start, verify Docker Desktop is running.

### Hot reload not working

The dev compose uses `-V` flag to renew anonymous volumes. If dependencies are stale, restart with `make down && make dev`.
