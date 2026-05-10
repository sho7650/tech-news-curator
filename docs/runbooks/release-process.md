# Release Process

## Overview

This project uses [release-please](https://github.com/googleapis/release-please) with Conventional Commits to automate versioning and changelog generation. Two components are released independently: `api` and `frontend`.

## How It Works

1. Merge PRs with Conventional Commit messages to `main`
2. release-please GitHub Action automatically creates/updates a release PR
3. When the release PR is merged, tags are created and CHANGELOGs are updated
4. Docker images can then be pushed to the registry

## Commit Message Format

```
feat: add article search endpoint          → minor bump
fix: handle null source URLs               → patch bump
feat!: redesign ingest API                  → major bump (breaking)
docs: update architecture diagram           → no bump (hidden)
chore: update dependencies                  → no bump (hidden)
```

See `release-please-config.json` for the full section configuration.

## Manual Release Steps

### 1. Pre-release Verification

```bash
# Ensure clean working tree
git status

# Run all checks
cd api && npm test
cd api && npx biome check src/
cd api && npx tsc --noEmit
cd frontend && npx playwright test
```

### 2. Build Docker Images

```bash
make build
```

This builds three images:
- `${REGISTRY}/news-curator/db:latest` (postgres + init scripts + SSL)
- `${REGISTRY}/news-curator/api:latest`
- `${REGISTRY}/news-curator/frontend:latest`

### 3. Push to Registry

```bash
# Set REGISTRY in .env or Makefile
make push
```

### 4. Deploy

There are two deployment patterns.

#### 4a. Local deployment (source tree present)

```bash
# Full deployment (DB → API → migrations → frontend)
make deploy
```

#### 4b. Remote deployment from registry (no source code on host)

On the deploy host, place only:
- `docker-compose.deploy.yml`
- `.env` (with `REGISTRY`, `POSTGRES_PASSWORD`, `NEWS_APP_PASSWORD`, `API_KEYS`, `CORS_ORIGINS`)

Then:
```bash
make deploy-pull   # pull latest images from registry
make deploy-up     # start: db → migration (one-shot) → api → frontend
```

The compose file chains startup via `depends_on` conditions:
- `news-db` healthcheck must pass
- `news-migrate` runs `node dist/run-migrate.js` and exits successfully
- `news-api` waits for both, then starts
- `news-frontend` waits for `news-api` healthcheck

Updates are zero-touch — re-running `make deploy-pull && make deploy-up` re-pulls
`:latest` images (`pull_policy: always`) and recreates only changed services.

## Component Versions

Each component has its own `package.json` version and `CHANGELOG.md`:
- `api/package.json` — API version
- `frontend/package.json` — Frontend version

Tags follow the format: `tech-news-curator-{api,frontend}-v{version}`
