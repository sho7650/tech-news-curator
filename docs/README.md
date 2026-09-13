# Documentation Index

This directory contains the system design, architecture, workflows, and operational guidance for Tech News Curator.

## Current Documentation (TypeScript Stack)

**Core System:**
- [`architecture.md`](architecture.md) — System overview, service architecture (n8n + Hono API + Next.js + PostgreSQL)
- [`coding-guide.md`](coding-guide.md) — Project structure, module organization, and Claude Code integration
- [`NIX-DEVELOPMENT.md`](NIX-DEVELOPMENT.md) — Reproducible development environment via Nix flake

**Feature Designs (Implemented/Approved):**
- [`DESIGN-digest-source.md`](DESIGN-digest-source.md) — Endpoint returning all articles for a JST day for digest generation (implemented Jun 2026)
- [`DESIGN-ingest-fetch-hardening.md`](DESIGN-ingest-fetch-hardening.md) — Browser headers and Cloudflare resilience in safe-fetch.ts (approved Jul 2026)
- [`DESIGN-ingest-markdown.md`](DESIGN-ingest-markdown.md) — Article extraction quality improvements for Japanese content
- [`DESIGN-ingest-noise-phase2.md`](DESIGN-ingest-noise-phase2.md) — Advanced noise filtering (duplicate paragraphs, credits, comments)
- [`DESIGN-ingest-e2e-snapshot.md`](DESIGN-ingest-e2e-snapshot.md) — Snapshot-based E2E testing for extraction reliability
- [`DESIGN-layout-improvement.md`](DESIGN-layout-improvement.md) — Frontend UI/UX redesign (approved Jun 2026)
- [`DESIGN-font-self-hosting.md`](DESIGN-font-self-hosting.md) — Switch from `next/font/google` to `@fontsource` (approved Jun 2026)
- [`DESIGN-logging.md`](DESIGN-logging.md) — Structured logging with Pino (draft)
- [`TEST-articles.md`](TEST-articles.md) — Real article test data for regression validation

**In Progress:**
- [`DESIGN-migration.md`](DESIGN-migration.md) — SQL migration system design via drizzle-kit (draft, unresolved)
- [`DESIGN-article-list-redesign.md`](DESIGN-article-list-redesign.md) — Infinite scroll redesign (design review pending)
- [`REQUIREMENTS-article-list-redesign.md`](REQUIREMENTS-article-list-redesign.md) — Requirements for infinite scroll feature
- [`WORKFLOW-migration.md`](WORKFLOW-migration.md) — Workflow for migration system implementation
- [`WORKFLOW-article-list-redesign.md`](WORKFLOW-article-list-redesign.md) — Workflow for redesign implementation
- [`WORKFLOW-layout-improvement.md`](WORKFLOW-layout-improvement.md) — Workflow for layout changes

## Historical Documentation (Python/FastAPI Era)

> ⚠️ **Superseded by the TypeScript implementation (Feb 2026).** These files are kept for context only. Current designs reference TypeScript equivalents above.

**Phase 1 (MVP):**
- [`REQUIREMENTS.md`](REQUIREMENTS.md) — Phase 1 requirements (Python-era)
- [`DESIGN.md`](DESIGN.md) — Phase 1 system design (Python-era)

**Phase 1 Expansions:**
- [`DESIGN-v1.1-TASKS.md`](DESIGN-v1.1-TASKS.md) — Phase 1.1 task list (Python-era)

**Phase 2 (Source Management, RSS):**
- [`REQUIREMENTS-v2.0.md`](REQUIREMENTS-v2.0.md) — Phase 2 requirements (Python-era)
- [`DESIGN-v2.0.md`](DESIGN-v2.0.md) — Phase 2 system design (Python-era)
- [`WORKFLOW-v2.0.md`](WORKFLOW-v2.0.md) — Phase 2 workflow (Python-era)
- [`WORKFLOW-phase2.md`](WORKFLOW-phase2.md) — Phase 2 detailed workflow (Python-era)

**Phase 3 (OAuth/JWT, Auth Infrastructure):**
- [`DESIGN-v3.0.md`](DESIGN-v3.0.md) — Phase 3 comprehensive design (Python-era)
- [`DESIGN-phase3.md`](DESIGN-phase3.md) — Phase 3 expanded design (Python-era)
- [`REQUIREMENTS-phase3-brainstorm.md`](REQUIREMENTS-phase3-brainstorm.md) — Phase 3 brainstorm notes (Python-era)
- [`DESIGN-phase3.1.md`](DESIGN-phase3.1.md) — OAuth/JWT authentication design (Python-era; requirements valid, design must be redone for TypeScript: jose/hono-jwt for RS256, arctic for OAuth, Hono middleware, drizzle-kit migration)
- [`WORKFLOW-phase3.md`](WORKFLOW-phase3.md) — Phase 3 workflow (Python-era)
- [`WORKFLOW-phase3.1.md`](WORKFLOW-phase3.1.md) — Phase 3.1 workflow (Python-era)

**Security:**
- [`SECURITY-FIXES.md`](SECURITY-FIXES.md) — Security vulnerability tracking (Python-era)
- [`WORKFLOW-SECURITY-FIXES.md`](WORKFLOW-SECURITY-FIXES.md) — Security fix workflow (Python-era)

**Legacy:**
- [`WORKFLOW.md`](WORKFLOW.md) — Original workflow template (Python-era)
- [`WORKFLOW-v1.1.md`](WORKFLOW-v1.1.md) — Phase 1.1 workflow (Python-era)

## Architecture Decisions

Formal decision records tracking architectural and technical choices:
- [`decisions/ADR-001-adopt-claude-code-project-structure.md`](decisions/ADR-001-adopt-claude-code-project-structure.md) — Project structure and Claude Code integration (accepted Mar 2026)
- [`decisions/ADR-002-migrate-api-python-fastapi-to-typescript-hono.md`](decisions/ADR-002-migrate-api-python-fastapi-to-typescript-hono.md) — Backend migration to TypeScript (accepted Feb 2026)

## Operational Runbooks

Step-by-step guides for common operational tasks:
- [`runbooks/local-dev-setup.md`](runbooks/local-dev-setup.md) — Local development environment setup
- [`runbooks/release-process.md`](runbooks/release-process.md) — Release and deployment procedures
