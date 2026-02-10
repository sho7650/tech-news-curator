.PHONY: dev up down build test migrate migrate-up deploy push

# Development environment
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Production start (no migration, apps only)
up:
	docker compose up -d

# Stop
down:
	docker compose down

# Build
build:
	docker compose build

# Run tests (Docker required: testcontainers auto-starts PostgreSQL)
# Prerequisite: pip install -r api/requirements-dev.txt
test:
	cd api && python -m pytest tests/ -v

# Create migration
migrate:
	cd api && alembic revision --autogenerate -m "$(msg)"

# Apply migrations (inside news-api container)
migrate-up:
	docker compose exec news-api alembic upgrade head

# Deploy (migration -> start in order)
deploy:
	docker compose up -d news-db
	docker compose up -d news-api
	docker compose exec news-api alembic upgrade head
	docker compose up -d news-frontend

# Push to registry
push:
	docker push registry.oshiire.to/news-curator/api:latest
	docker push registry.oshiire.to/news-curator/frontend:latest
