# Audit Remediation Plan — tech-news-curator

Source: audit at commit 6855e0b (2026-09-13). Three phases, one feature branch each,
stacked: fix/audit-phase1-security-perf → docs/audit-phase2-cleanup → refactor/audit-phase3-structure.

## Phase 1 — This week (critical/high)  · branch `fix/audit-phase1-security-perf` · DONE
- [x] 1.1 SSRF IPv4-mapped bypass: `ipaddr.process()` unwrap, IPv4-compatible unwrap, transition ranges blocked; 17 validator tests
- [x] 1.2 og:image validated through `validateUrl()` at ingest (rejection nulls the field); fixture tests mock DNS
- [x] 1.3 hono 4.13.7 / @hono/node-server 1.19.17; next 16.3.5; frontend audit job in CI; API audit threshold moderate
- [x] 1.4 `ix_articles_published_at_desc` (DESC NULLS LAST) + `ix_articles_created_at` via drizzle-kit migration 0001
- [x] 1.5 PUBLIC_URL / FETCH_USER_AGENT wired into both compose files; production rejects localhost PUBLIC_URL
- [x] Code review fix: `::` / `::1` keep native classification; zone IDs documented
- [ ] `.env.example`: add FETCH_USER_AGENT, TRUSTED_PROXIES; dedupe REGISTRY; drop PUBLIC_API_URL — **blocked: file denied by tool permissions, needs manual edit**

## Phase 2 — Quick wins  · branch `docs/audit-phase2-cleanup` · DONE
- [x] READMEs rewritten for the TypeScript stack (full endpoint table, API key note, env vars)
- [x] docs/architecture.md: three factual corrections
- [x] Stale files removed (tools/.gitkeep ×2, zap-config.conf, `make zap-scan`); tasks/todo.md now holds this plan
- [x] security.yml: duplicate lint/test jobs removed; Biome lint moved into ci.yml (it was the only lint in CI)
- [x] Rate limiter: forwarding headers trusted only from `TRUSTED_PROXIES` CIDRs; keyed on socket address otherwise
- [ ] `.env.example` dedupe — blocked (see above)

## Phase 3 — Structural  · branch `refactor/audit-phase3-structure` · DONE
1. [x] Route factories + `createApp(db)` + `src/mappers/`; every HTTP test mounts the real app; SSE route, pollNewArticles, and app wiring tests added
2. [x] OpenAPI 3.1 from zod via hono-openapi at `GET /openapi.json`; `npm run openapi:export` → `api/openapi.json`; frontend `npm run types:generate` → `src/lib/api-types.ts`; `types.ts` aliases generated types
3. [x] `release-images.yml`: tag-triggered build + push of api/db/frontend under release version and latest
4. [x] CI E2E job runs `npm run db:migrate` and asserts the 0001 index; docker-build job builds the db image
5. [x] Deploy compose kept standalone (base bind-mounts source; overlays cannot remove mounts) — instead `API_IMAGE_TAG` / `FRONTEND_IMAGE_TAG` pin release versions
6. [x] Middleware grouping via `writeGuard(limit)` (rate limit + API key pair in one place); per-route order preserved
7. [x] `docs/README.md` index, superseded banners on 17 Python-era docs, ADR-002 for the migration

## Follow-ups (not in scope of the audit plan)
- [ ] Add Vitest unit tests for frontend `lib/` helpers (audit MEDIUM)
- [ ] Redo Phase 3.1 auth design for TypeScript (jose / arctic) — see docs/README.md
- [ ] Consider moving extraction to a worker thread if ingest volume grows
- [ ] Configure repo variable `REGISTRY` and secrets `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, `DB_SSL_*` for release-images.yml
