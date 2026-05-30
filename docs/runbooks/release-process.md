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

#### Target platform

Builds default to **`linux/amd64`** because the deploy hosts are Linux x86_64.
Override for other targets:

```bash
PLATFORM=linux/arm64 make build       # e.g. for ARM Linux hosts
```

On an Apple Silicon (arm64) Mac, building `linux/amd64` runs through Docker
Desktop's QEMU emulation, so the first build is noticeably slower than a native
build. Subsequent builds benefit from layer cache.

The platform setting is scoped to `make build` only — `make dev` and `make up`
continue to run on the host's native architecture for fast local iteration.

### 3. Push to Registry

Registry hosts are configured in `.env` (overridable via environment/CLI):

```bash
REGISTRY=registry.example.com           # production
REGISTRY_TEST=registry.test.example.com # test environment
```

Resolution order is **environment/CLI > `.env` > built-in default**, so a one-off
push can override without editing `.env`: `REGISTRY=other.example.com make push`.

```bash
# Production
make push

# Test environment (retags the locally-built images — no rebuild)
make push-test
```

`make build` tags images as `${REGISTRY}/news-curator/{db,api,frontend}:latest`.
`make push-test` retags those same images to `${REGISTRY_TEST}/...` and pushes them,
so the exact bytes validated in test are the ones promoted to production.

**Recommended build-once / promote flow:**

```bash
make build        # build once, tagged for ${REGISTRY}
make push-test    # ship the identical images to the test registry
# ... validate in the test environment ...
make push         # promote the same images to production
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
- `news-migrate` runs `node dist/db/run-migrate.js` and exits successfully
- `news-api` waits for both, then starts
- `news-frontend` waits for `news-api` healthcheck

Updates are zero-touch — re-running `make deploy-pull && make deploy-up` re-pulls
`:latest` images (`pull_policy: always`) and recreates only changed services.

##### API host bind (`API_BIND_ADDR`)

The API port (`8100`) defaults to **loopback-only** (`127.0.0.1:8100:8100`),
suitable for production where the ingest client (n8n) lives on the same host.

For environments where the ingest client is on a different host (e.g. a test box
that receives `/ingest` calls from a remote n8n), opt in by setting
`API_BIND_ADDR=0.0.0.0` in that host's `.env`:

```env
# .env on the test deploy host
API_BIND_ADDR=0.0.0.0
```

then `docker compose -f docker-compose.deploy.yml up -d --force-recreate news-api`.

Default (`127.0.0.1`) is unchanged for production. The API remains protected by
`API_KEYS` regardless of bind address — but exposing externally widens the attack
surface to "API key holders", so prefer leaving it on loopback wherever possible.

## Component Versions

Each component has its own `package.json` version and `CHANGELOG.md`:
- `api/package.json` — API version
- `frontend/package.json` — Frontend version

Tags follow the format: `tech-news-curator-{api,frontend}-v{version}`
