# ADR-002: Migrate API from Python/FastAPI to TypeScript/Hono

## Status

Accepted

## Date

2026-02-25

## Context

The project uses Next.js 16 (TypeScript) for the frontend and n8n (external) for orchestration. The API layer was Python/FastAPI with SQLAlchemy ORM, Alembic migrations, and Pydantic validation. This created a multi-language stack requiring separate tooling, different runtime requirements, and inconsistent error handling patterns across the system.

## Decision Drivers

- Single-language stack (TypeScript throughout frontend and backend) simplifies developer experience and reduces context switching
- Shared tooling: Biome (linter), TypeScript (type checker), Vitest (testing framework)
- Faster cold start times for containerized deployments
- Unified testing story: Vitest + @testcontainers/postgresql instead of pytest + Docker setup
- Alignment with the existing Next.js infrastructure

## Considered Options

1. Keep Python FastAPI, add TypeScript build tooling to improve alignment
2. Migrate API to TypeScript/Express or similar
3. Migrate API to TypeScript/Hono + Node.js

## Decision Outcome

Chosen option: "Migrate API to TypeScript/Hono", because it provides the simplest HTTP handler semantics, native middleware support, and the smallest runtime surface.

### Positive Consequences

- Single language (TypeScript) across frontend and backend reduces cognitive load
- Biome + tsc provide unified linting and type-checking across all code
- Vitest + @testcontainers/postgresql simplifies test infrastructure
- Faster container startup vs. Python
- Drizzle ORM + postgres.js offers strong PostgreSQL integration and type safety
- @mozilla/readability + linkedom replaces trafilatura for HTML extraction
- Zod replaces Pydantic for request/response validation

### Negative Consequences

- Complete API rewrite required
- Documentation drift: READMEs and design docs written for the Python stack had to be rewritten or marked historical
- Documentation for Phase 3.1 (OAuth/JWT) must be redesigned for TypeScript (jose/hono-jwt for RS256, arctic for OAuth)
- Extraction quality baseline shifts (trafilatura → readability + linkedom); handled by the noise filters in `text-cleaner.ts`

## Thinking Process

The multi-language requirement was a friction point in the first two phases. Moving to TypeScript unifies the stack and eliminates the need to context-switch between Python and JavaScript development. The migration was completed systematically: routes → services → database layer → migrations → tests. Quality assurance (Biome + tsc + Vitest) was built in from the start.

## Links

- Implements: feature/ts-migration branch (commit ececf0b, 2026-02-25)
- Related: ADR-001-adopt-claude-code-project-structure
- Documentation: architecture.md (updated post-migration)
