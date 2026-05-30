# Registry resolution: env/CLI override > .env > built-in default.
# Mirrors the API key extraction pattern used by the test-e2e target below.
ENV_REGISTRY      := $(shell grep -E '^REGISTRY=' .env 2>/dev/null | head -1 | cut -d= -f2-)
ENV_REGISTRY_TEST := $(shell grep -E '^REGISTRY_TEST=' .env 2>/dev/null | head -1 | cut -d= -f2-)
REGISTRY      ?= $(if $(ENV_REGISTRY),$(ENV_REGISTRY),ghcr.io/your-org)
REGISTRY_TEST ?= $(if $(ENV_REGISTRY_TEST),$(ENV_REGISTRY_TEST),$(REGISTRY))

IMAGES := db api frontend

# Build target platform (deploy hosts are linux/amd64).
# Override with PLATFORM=linux/arm64 for ARM hosts.
PLATFORM ?= linux/amd64

COMPOSE_DEV    = docker compose -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD   = docker compose -f docker-compose.yml -f docker-compose.prod.yml
COMPOSE_DEPLOY = docker compose -f docker-compose.deploy.yml

.PHONY: dev up down build build-db test migrate migrate-up deploy deploy-pull deploy-up deploy-down push push-test lint sast audit security test-e2e test-e2e-ui zap-scan

# Development environment
# -V renews anonymous volumes (node_modules) so new dependencies are picked up
dev:
	$(COMPOSE_DEV) up --build -V

# Production start (no migration, apps only)
up:
	$(COMPOSE_PROD) up -d

# Stop (works for both dev and prod)
down:
	docker compose down

# Build all images (api, frontend via compose; db via dedicated Dockerfile)
# REGISTRY is exported so compose tags images with the same value as build-db/push.
# DOCKER_DEFAULT_PLATFORM forces the build target arch (read by compose -> buildx).
build: build-db
	REGISTRY=$(REGISTRY) DOCKER_DEFAULT_PLATFORM=$(PLATFORM) $(COMPOSE_PROD) build

# Build the custom postgres image (init scripts + SSL baked in)
build-db:
	docker build --platform $(PLATFORM) -t $(REGISTRY)/news-curator/db:latest ./db

# Run tests (Docker required: testcontainers auto-starts PostgreSQL)
test:
	cd api && npm test

# Create migration
migrate:
	cd api && npx drizzle-kit generate

# Apply migrations (inside news-api container, uses drizzle-orm only)
migrate-up:
	docker compose exec news-api node dist/db/run-migrate.js

# Deploy (migration -> start in order)
deploy:
	$(COMPOSE_PROD) up -d news-db
	$(COMPOSE_PROD) up -d news-api
	$(COMPOSE_PROD) exec news-api node dist/db/run-migrate.js
	$(COMPOSE_PROD) up -d news-frontend

# Push to the production registry
push:
	@for img in $(IMAGES); do docker push $(REGISTRY)/news-curator/$$img:latest; done

# Push locally-built images to the TEST registry (retag from $(REGISTRY) — no rebuild).
# Run `make build` first; the same image bytes are promoted test -> prod.
push-test:
	@test "$(REGISTRY_TEST)" != "$(REGISTRY)" || { echo "REGISTRY_TEST is unset (resolves to REGISTRY). Set REGISTRY_TEST in .env"; exit 1; }
	@for img in $(IMAGES); do \
		docker tag  $(REGISTRY)/news-curator/$$img:latest $(REGISTRY_TEST)/news-curator/$$img:latest; \
		docker push $(REGISTRY_TEST)/news-curator/$$img:latest; \
	done

# Deploy host targets — pull images and start the unified compose
deploy-pull:
	$(COMPOSE_DEPLOY) pull

deploy-up:
	$(COMPOSE_DEPLOY) up -d

deploy-down:
	$(COMPOSE_DEPLOY) down

# Security scanning
lint:
	cd api && npx biome check src/

# E2E tests (extracts first API key from .env for authentication)
test-e2e:
	$(eval API_KEY := $(shell grep '^API_KEYS=' .env 2>/dev/null | cut -d= -f2 | cut -d, -f1))
	cd frontend && TEST_API_KEY=$(API_KEY) npx playwright test

test-e2e-ui:
	$(eval API_KEY := $(shell grep '^API_KEYS=' .env 2>/dev/null | cut -d= -f2 | cut -d, -f1))
	cd frontend && TEST_API_KEY=$(API_KEY) npx playwright test --ui

# OWASP ZAP scan
zap-scan:
	mkdir -p zap-reports
	docker run --rm --network host \
		-v $(pwd)/zap-reports:/zap/wrk:rw \
		-e ZAP_API_KEY=$(ZAP_API_KEY) \
		ghcr.io/zaproxy/zaproxy:stable \
		zap-api-scan.py \
		-t http://localhost:8100/openapi.json \
		-f openapi \
		-r report.html \
		-J report.json \
		-z "-config replacer.full_list(0).description=AuthHeader \
		    -config replacer.full_list(0).enabled=true \
		    -config replacer.full_list(0).matchtype=REQ_HEADER \
		    -config replacer.full_list(0).matchstr=X-API-Key \
		    -config replacer.full_list(0).replacement=$(ZAP_API_KEY)"
