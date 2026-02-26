REGISTRY ?= ghcr.io/your-org
COMPOSE_DEV  = docker compose -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: dev up down build test migrate migrate-up deploy push lint sast audit security test-e2e test-e2e-ui zap-scan

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

# Build
build:
	$(COMPOSE_PROD) build

# Run tests (Docker required: testcontainers auto-starts PostgreSQL)
test:
	cd api && npm test

# Create migration
migrate:
	cd api && npx drizzle-kit generate

# Apply migrations (inside news-api container)
migrate-up:
	docker compose exec news-api npx drizzle-kit push

# Deploy (migration -> start in order)
deploy:
	$(COMPOSE_PROD) up -d news-db
	$(COMPOSE_PROD) up -d news-api
	$(COMPOSE_PROD) exec news-api npx drizzle-kit push
	$(COMPOSE_PROD) up -d news-frontend

# Push to registry
push:
	docker push $(REGISTRY)/news-curator/api:latest
	docker push $(REGISTRY)/news-curator/frontend:latest

# Security scanning
lint:
	cd api && npx biome check src/

# E2E tests
test-e2e:
	cd frontend && npx playwright test

test-e2e-ui:
	cd frontend && npx playwright test --ui

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
