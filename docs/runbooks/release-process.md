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

### 3. Push to Registry

```bash
# Set REGISTRY in .env or Makefile
make push
```

This pushes:
- `${REGISTRY}/news-curator/api:latest`
- `${REGISTRY}/news-curator/frontend:latest`

### 4. Deploy

```bash
# Full deployment (DB → API → migrations → frontend)
make deploy
```

## Component Versions

Each component has its own `package.json` version and `CHANGELOG.md`:
- `api/package.json` — API version
- `frontend/package.json` — Frontend version

Tags follow the format: `tech-news-curator-{api,frontend}-v{version}`
